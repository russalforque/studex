import { beforeEach, describe, expect, it } from 'vitest'
import initSqlJs from 'sql.js'
import { migrate } from '@/db/migrate'
import { MIGRATIONS, SCHEMA_VERSION } from '@/db/migrations'
import { SerializedDatabase } from '@/db/SerializedDatabase'
import { createSqlJsDriver } from '@/db/sqljsDriver'
import { startFocus } from '@/domain/focus'
import { uuid } from '@/utils/id'
import { parseBackup } from './backupRepository'
import { createRepositories, type Repositories } from './index'

let repos: Repositories
let semesterId: string
let subjectId: string

async function emptyDb() {
  const SQL = await initSqlJs()
  return new SerializedDatabase(createSqlJsDriver(new SQL.Database()))
}

async function freshRepos(): Promise<Repositories> {
  const db = await emptyDb()
  await migrate(db)
  const r = createRepositories(db)
  await r.db.transaction((tx) =>
    r.settings.completeOnboarding(tx, { studentName: 'Alex', schoolName: null, currency: 'PHP' }, { name: '1st Semester', academicYear: null }),
  )
  return r
}

const subjectInput = (name: string) => ({ name, code: null, instructor: null, room: null, color: '#4F46E5', notes: null })

const rule = (over: Partial<Parameters<Repositories['recurring']['create']>[1]> = {}) => ({
  name: 'Jeepney fare',
  amount: 15_00,
  categoryId: 'cat-transport',
  frequency: 'daily' as const,
  intervalDays: null,
  startDate: '2026-10-01',
  endDate: null,
  mode: 'auto' as const,
  ...over,
})

const plan = (over: Partial<Parameters<Repositories['planned']['create']>[1]> = {}) => ({
  title: 'Project materials',
  amount: 350_00,
  categoryId: 'cat-projects',
  dueDate: '2026-10-09',
  subjectId: null,
  taskId: null,
  reserve: true,
  note: null,
  ...over,
})

const allowance = { amount: 1400_00, frequency: 'weekly' as const, intervalDays: null, anchorDate: '2026-10-05', savingsAmount: 0, savingsGoalId: null }

beforeEach(async () => {
  repos = await freshRepos()
  semesterId = (await repos.settings.currentSemester())!.id
  subjectId = await repos.subjects.create(semesterId, subjectInput('Networking'))
})

describe('migration 005', () => {
  it('upgrades a version 4 database, keeping grades, subjects and settings', async () => {
    const db = await emptyDb()
    await migrate(db, MIGRATIONS.filter((m) => m.version <= 4))
    await db.run(`INSERT INTO semesters (id, name) VALUES ('s1', 'Term')`)
    await db.run(`INSERT INTO settings (id, student_name, current_semester_id, onboarded_at, reminder_prefs) VALUES (1, 'Kim', 's1', 'x', ?)`, [
      JSON.stringify({ enabled: true, tasks: false, exams: true, classes: true, classLeadMinutes: 30 }),
    ])
    await db.run(`INSERT INTO subjects (id, semester_id, name, color, target_grade) VALUES ('sub1', 's1', 'Math', '#000000', 90)`)
    await db.run(`INSERT INTO grade_items (id, subject_id, title, score, max_score, weight) VALUES ('g1', 'sub1', 'Quiz 1', 9, 10, 2)`)

    await expect(migrate(db)).resolves.toBe(SCHEMA_VERSION)
    const r = createRepositories(db)
    expect(await r.academics.gradesForSubject('sub1')).toEqual([
      { id: 'g1', subjectId: 'sub1', categoryId: null, title: 'Quiz 1', score: 9, maxScore: 10, weight: 2, gradedOn: null },
    ])
    const subject = await r.subjects.get('sub1')
    expect(subject.targetGrade).toBe(90)
    expect(subject.attendanceRequired).toBeNull()
    const settings = (await r.settings.get())!
    // Old preferences are kept; new ones take their defaults.
    expect(settings.reminders).toMatchObject({ enabled: true, tasks: false, classLeadMinutes: 30, taskLeadMinutes: 1440, planned: true })
    expect(settings.attendanceRules).toEqual({ late: 'present', excused: 'skip' })
    // Deleting the subject still removes its grades (the rebuilt table kept its foreign key).
    await r.subjects.remove('sub1')
    expect(await r.academics.gradesForSubject('sub1')).toEqual([])
  })
})

describe('recurring expenses', () => {
  it('records each missed day once when the app reopens, and never twice', async () => {
    await repos.recurring.create('r1', rule())
    expect(await repos.recurring.reconcile('2026-10-05')).toBe(5)
    expect(await repos.recurring.reconcile('2026-10-05')).toBe(0)
    // A few days later, only the new days are added.
    expect(await repos.recurring.reconcile('2026-10-08')).toBe(3)
    expect(await repos.expenses.total('2026-10-01', '2026-10-08')).toBe(8 * 15_00)
  })

  it('handles two reconciles started together', async () => {
    await repos.recurring.create('r1', rule())
    const [a, b] = await Promise.all([repos.recurring.reconcile('2026-10-03'), repos.recurring.reconcile('2026-10-03')])
    expect(a + b).toBe(3)
    expect(await repos.expenses.total('2026-10-01', '2026-10-03')).toBe(3 * 15_00)
  })

  it("doesn't bring back an expense the student deleted", async () => {
    await repos.recurring.create('r1', rule())
    await repos.recurring.reconcile('2026-10-02')
    const [first] = await repos.expenses.listRange('2026-10-01', '2026-10-01')
    await repos.expenses.remove(first!.id)
    await repos.recurring.reconcile('2026-10-02')
    expect(await repos.expenses.total('2026-10-01', '2026-10-02')).toBe(15_00)
  })

  it('waits for confirmation in ask-first mode, with confirm and skip', async () => {
    await repos.recurring.create('r1', rule({ mode: 'confirm', frequency: 'weekly', startDate: '2026-09-21', amount: 50_00, name: 'Load' }))
    expect(await repos.recurring.reconcile('2026-10-08')).toBe(0)
    let pending = await repos.recurring.pending('2026-10-08')
    expect(pending.map((p) => p.date)).toEqual(['2026-09-21', '2026-09-28', '2026-10-05'])

    await repos.recurring.confirm('r1', '2026-09-21')
    await repos.recurring.confirm('r1', '2026-09-21')
    await repos.recurring.confirm('r1', '2026-09-28', 60_00)
    await repos.recurring.skip('r1', '2026-10-05')
    pending = await repos.recurring.pending('2026-10-08')
    expect(pending).toEqual([])
    expect(await repos.expenses.total('2026-09-01', '2026-10-31')).toBe(110_00)
  })

  it('stops when paused or past its end date, and keeps history when removed', async () => {
    await repos.recurring.create('r1', rule({ endDate: '2026-10-02' }))
    await repos.recurring.create('r2', rule({ name: 'Lunch' }))
    await repos.recurring.setActive('r2', false, '2026-10-01')
    expect(await repos.recurring.reconcile('2026-10-08')).toBe(2)
    await repos.recurring.remove('r1')
    expect(await repos.expenses.total('2026-10-01', '2026-10-08')).toBe(30_00)
  })

  it('skips the days it was paused when turned back on', async () => {
    await repos.recurring.create('r1', rule())
    await repos.recurring.reconcile('2026-10-02')
    await repos.recurring.setActive('r1', false, '2026-10-03')
    await repos.recurring.setActive('r1', true, '2026-10-07')
    // Oct 3–6 were paused; Oct 7 (today) is recorded.
    expect(await repos.recurring.reconcile('2026-10-07')).toBe(1)
    expect(await repos.expenses.total('2026-10-01', '2026-10-07')).toBe(3 * 15_00)
  })

  it('is idempotent to create', async () => {
    await repos.recurring.create('r1', rule())
    await repos.recurring.create('r1', rule())
    expect(await repos.recurring.list()).toHaveLength(1)
  })
})

describe('planned expenses', () => {
  beforeEach(async () => {
    await repos.allowance.savePlan(allowance, '2026-10-07')
  })

  it('reserves money until paid, then counts it as spending exactly once', async () => {
    const before = (await repos.allowance.currentBudget('2026-10-07', []))!.summary
    await repos.planned.create('p1', plan())
    const reserved = (await repos.allowance.currentBudget('2026-10-07', []))!.summary
    expect(reserved.reserved).toBe(350_00)
    expect(reserved.spent).toBe(0)
    expect(reserved.dailyAllowance).toBe(Math.floor((1400_00 - 350_00) / 5))
    expect(reserved.dailyAllowance).toBeLessThan(before.dailyAllowance)

    // Paid today, for a bit less than planned.
    await repos.planned.markPaid('p1', 'e1', { amount: 320_00, spentOn: '2026-10-07' })
    await repos.planned.markPaid('p1', 'e2', { amount: 320_00, spentOn: '2026-10-07' })
    const paid = (await repos.allowance.currentBudget('2026-10-07', []))!.summary
    expect(paid.reserved).toBe(0)
    expect(paid.spent).toBe(320_00)
    // It was set aside this morning, so it doesn't use up today's own amount.
    expect(paid.spentToday).toBe(0)
    expect(paid.safeToSpendToday).toBe(Math.floor((1400_00 - 320_00) / 5))
    expect((await repos.planned.get('p1')).paidAmount).toBe(320_00)
  })

  it('goes back to reserved when the payment is undone or its expense deleted', async () => {
    await repos.planned.create('p1', plan())
    await repos.planned.markPaid('p1', 'e1', { amount: 350_00, spentOn: '2026-10-06' })
    await repos.planned.markUnpaid('p1')
    let s = (await repos.allowance.currentBudget('2026-10-07', []))!.summary
    expect([s.spent, s.reserved]).toEqual([0, 350_00])

    await repos.planned.markPaid('p1', 'e2', { amount: 350_00, spentOn: '2026-10-06' })
    await repos.expenses.remove('e2')
    s = (await repos.allowance.currentBudget('2026-10-07', []))!.summary
    expect([s.spent, s.reserved]).toEqual([0, 350_00])
  })

  it('only reserves what is due by the end of this period and marked to reserve', async () => {
    await repos.planned.create('later', plan({ dueDate: '2026-11-30' }))
    await repos.planned.create('free', plan({ reserve: false }))
    await repos.planned.create('undated', plan({ dueDate: null, amount: 100_00 }))
    expect((await repos.allowance.currentBudget('2026-10-07', []))!.summary.reserved).toBe(100_00)
  })

  it('keeps its links to a subject and task until they are deleted', async () => {
    const taskId = uuid()
    await repos.tasks.create(taskId, {
      title: 'Poster', subjectId, description: null, kind: 'project', dueDate: '2026-10-09', dueTime: null, priority: 'medium', status: 'todo',
    })
    await repos.planned.create('p1', plan({ subjectId, taskId }))
    expect(await repos.planned.get('p1')).toMatchObject({ subjectName: 'Networking', taskTitle: 'Poster' })
    await repos.tasks.remove(taskId)
    expect((await repos.planned.get('p1')).taskId).toBeNull()
  })
})

describe('expense presets', () => {
  it('can be added, edited and removed', async () => {
    await repos.expenses.createPreset({ name: 'Jeepney fare', amount: 15_00, categoryId: 'cat-transport' })
    await repos.expenses.createPreset({ name: 'Lunch', amount: 85_00, categoryId: 'cat-food' })
    let presets = await repos.expenses.listPresets()
    expect(presets.map((p) => p.name)).toEqual(['Jeepney fare', 'Lunch'])
    await repos.expenses.updatePreset(presets[0]!.id, { name: 'Jeep', amount: 13_00, categoryId: 'cat-transport' })
    await repos.expenses.removePreset(presets[1]!.id)
    presets = await repos.expenses.listPresets()
    expect(presets).toMatchObject([{ name: 'Jeep', amount: 13_00, categoryName: 'Transportation' }])
  })
})

describe('focus sessions', () => {
  const T0 = Date.UTC(2026, 9, 8, 1, 0, 0)

  it('keeps the running timer across app restarts', async () => {
    const s = startFocus({ sessionId: 'f1', subjectId, minutes: 25, breakMinutes: 5, now: T0 })
    await repos.focus.saveState(s)
    expect(await repos.focus.getState()).toEqual(s)
  })

  it('records a session once, even if finished twice', async () => {
    const s = startFocus({ sessionId: 'f1', subjectId, minutes: 25, breakMinutes: null, now: T0 })
    await repos.focus.saveState(s)
    await Promise.all([repos.focus.finish(s, T0 + 30 * 60_000), repos.focus.finish(s, T0 + 31 * 60_000)])
    const sessions = await repos.focus.sessionsBetween(new Date(T0 - 1).toISOString(), new Date(T0 + 86_400_000).toISOString())
    expect(sessions).toHaveLength(1)
    expect(sessions[0]).toMatchObject({ status: 'completed', focusedSeconds: 1500, subjectName: 'Networking' })
    expect(await repos.focus.getState()).toBeNull()
  })

  it("still records when the subject was deleted while the timer ran", async () => {
    const s = startFocus({ sessionId: 'f2', subjectId, minutes: 25, breakMinutes: null, now: T0 })
    await repos.subjects.remove(subjectId)
    expect(await repos.focus.finish(s, T0 + 10 * 60_000)).toBe('interrupted')
    const [row] = await repos.focus.recent()
    expect(row).toMatchObject({ subjectId: null, focusedSeconds: 600 })
  })

  it('counts toward the weekly summary', async () => {
    const start = new Date(2026, 9, 7, 9, 0).getTime()
    await repos.focus.finish(startFocus({ sessionId: 'w1', subjectId: null, minutes: 50, breakMinutes: null, now: start }), start + 3_600_000)
    const w = await repos.insights.weekSummary('2026-10-05', '2026-10-08')
    expect([w.studySeconds, w.studySessions]).toEqual([3000, 1])
    const empty = await repos.insights.weekSummary('2026-09-28', '2026-10-08')
    expect([empty.studySeconds, empty.tasksDue, empty.spent, empty.examsAhead]).toEqual([0, 0, 0, 0])
  })
})

describe('grade categories', () => {
  it("can't add up to more than 100%, and removing one keeps its items", async () => {
    await repos.academics.saveCategory(subjectId, null, { name: 'Quizzes', weight: 30 })
    await repos.academics.saveCategory(subjectId, null, { name: 'Exams', weight: 60 })
    await expect(repos.academics.saveCategory(subjectId, null, { name: 'Projects', weight: 20 })).rejects.toThrow(/10% is left/)
    await expect(repos.academics.saveCategory(subjectId, null, { name: 'quizzes', weight: 5 })).rejects.toThrow(/already/)
    const [quizzes] = await repos.academics.categoriesForSubject(subjectId)
    // Editing a category doesn't count its own old weight against it.
    await repos.academics.saveCategory(subjectId, quizzes!.id, { name: 'Quizzes', weight: 40 })

    await repos.academics.addGrade(subjectId, { title: 'Quiz 1', score: null, maxScore: 10, weight: 1, gradedOn: null, categoryId: quizzes!.id })
    await repos.academics.removeCategory(quizzes!.id)
    const [item] = await repos.academics.gradesForSubject(subjectId)
    expect(item).toMatchObject({ title: 'Quiz 1', score: null, categoryId: null })
  })
})

describe('exam topics', () => {
  it('can be renamed and reordered', async () => {
    await repos.exams.create('x1', { title: 'Midterm', subjectId, kind: 'exam', date: '2026-10-20', time: null, coverage: null, notes: null, studyStatus: 'not_started' }, [
      'OSI Model',
      'TCP/IP',
      'Subnetting',
    ])
    let topics = await repos.exams.listTopics('x1')
    await repos.exams.moveTopic(topics[2]!.id, -1)
    await repos.exams.moveTopic(topics[0]!.id, -1)
    await repos.exams.renameTopic(topics[1]!.id, 'TCP/IP model')
    topics = await repos.exams.listTopics('x1')
    expect(topics.map((t) => t.title)).toEqual(['OSI Model', 'Subnetting', 'TCP/IP model'])
  })
})

describe('attendance settings', () => {
  it('stores the requirement per subject and the rules in settings', async () => {
    await repos.subjects.update(subjectId, { ...subjectInput('Networking'), attendanceRequired: 80 })
    expect((await repos.subjects.get(subjectId)).attendanceRequired).toBe(80)
    await repos.settings.setAttendanceRules({ late: 'half', excused: 'present' })
    expect((await repos.settings.get())!.attendanceRules).toEqual({ late: 'half', excused: 'present' })
  })
})

describe('backup of the new records', () => {
  it('restores sessions, recurring and planned expenses, presets and grade categories into a fresh install', async () => {
    await repos.allowance.savePlan(allowance, '2026-10-07')
    await repos.recurring.create('r1', rule())
    await repos.recurring.reconcile('2026-10-03')
    await repos.planned.create('p1', plan({ subjectId }))
    await repos.planned.markPaid('p1', 'e1', { amount: 300_00, spentOn: '2026-10-06' })
    await repos.expenses.createPreset({ name: 'Lunch', amount: 85_00, categoryId: 'cat-food' })
    await repos.academics.saveCategory(subjectId, null, { name: 'Quizzes', weight: 30 })
    const T0 = Date.UTC(2026, 9, 6, 1, 0, 0)
    await repos.focus.finish(startFocus({ sessionId: 'f1', subjectId, minutes: 25, breakMinutes: null, now: T0 }), T0 + 26 * 60_000)

    const backup = parseBackup(JSON.stringify(await repos.backup.exportAll('test')))
    const fresh = await freshRepos()
    await fresh.backup.restore(backup)

    expect(await fresh.recurring.list()).toHaveLength(1)
    // Restored occurrences still prevent re-recording.
    expect(await fresh.recurring.reconcile('2026-10-03')).toBe(0)
    expect(await fresh.planned.get('p1')).toMatchObject({ expenseId: 'e1', paidAmount: 300_00, subjectName: 'Networking' })
    expect(await fresh.expenses.listPresets()).toHaveLength(1)
    expect(await fresh.academics.categoriesForSubject(subjectId)).toHaveLength(1)
    expect(await fresh.focus.recent()).toHaveLength(1)
    expect(await fresh.expenses.total('2026-10-01', '2026-10-31')).toBe(3 * 15_00 + 300_00)
  })
})
