import { beforeEach, describe, expect, it } from 'vitest'
import initSqlJs from 'sql.js'
import { migrate } from '@/db/migrate'
import { MIGRATIONS, SCHEMA_VERSION } from '@/db/migrations'
import { SerializedDatabase } from '@/db/SerializedDatabase'
import { createSqlJsDriver } from '@/db/sqljsDriver'
import { DEFAULT_REMINDERS } from '@/types/models'
import { uuid } from '@/utils/id'
import { parseBackup, previewBackup } from './backupRepository'
import { createRepositories, type Repositories } from './index'

let repos: Repositories
let semesterId: string
let subjectId: string

async function emptyDb() {
  const SQL = await initSqlJs()
  return new SerializedDatabase(createSqlJsDriver(new SQL.Database()))
}

async function onboard(r: Repositories) {
  await r.db.transaction((tx) =>
    r.settings.completeOnboarding(
      tx,
      { studentName: 'Alex Cruz', schoolName: null, currency: 'PHP' },
      { name: '1st Semester', academicYear: '2026–2027' },
    ),
  )
}

const subjectInput = (name: string) => ({ name, code: null, instructor: null, room: null, color: '#4F46E5', notes: null })

beforeEach(async () => {
  const db = await emptyDb()
  await migrate(db)
  repos = createRepositories(db)
  await onboard(repos)
  semesterId = (await repos.settings.currentSemester())!.id
  subjectId = await repos.subjects.create(semesterId, subjectInput('Networking'))
})

describe('migration 002', () => {
  it('upgrades a version 1 database without losing data', async () => {
    const db = await emptyDb()
    await migrate(db, MIGRATIONS.filter((m) => m.version === 1))
    const r = createRepositories(db)
    await db.run(`INSERT INTO semesters (id, name) VALUES ('s1', 'Term')`)
    await db.run(`INSERT INTO settings (id, student_name, current_semester_id, onboarded_at) VALUES (1, 'Kim', 's1', 'x')`)
    await db.run(`INSERT INTO subjects (id, semester_id, name, color) VALUES ('sub1', 's1', 'Math', '#000000')`)
    await db.run(`INSERT INTO expenses (id, category_id, amount_minor, spent_on) VALUES ('e1', 'cat-food', 8500, '2026-10-01')`)

    await expect(migrate(db)).resolves.toBe(SCHEMA_VERSION)
    const settings = await r.settings.get()
    expect(settings?.studentName).toBe('Kim')
    expect(settings?.reminders.enabled).toBe(false)
    expect((await r.subjects.get('sub1')).targetGrade).toBeNull()
    expect(await r.expenses.total('2026-10-01', '2026-10-01')).toBe(8500)
  })
})

describe('profile', () => {
  it('saves course, year level and a photo, and can remove the photo', async () => {
    await repos.settings.updateProfile({ studentName: 'Alex', schoolName: 'UP', course: 'BSIT', yearLevel: '2nd year' })
    await repos.settings.setAvatar('data:image/jpeg;base64,AAAA')
    let s = await repos.settings.get()
    expect(s).toMatchObject({ studentName: 'Alex', course: 'BSIT', yearLevel: '2nd year', currency: 'PHP' })
    expect(s?.avatar).toMatch(/^data:image/)
    await repos.settings.setAvatar(null)
    s = await repos.settings.get()
    expect(s?.avatar).toBeNull()
  })

  it('rejects anything that is not an image', async () => {
    await expect(repos.settings.setAvatar('javascript:alert(1)')).rejects.toThrow(/photo/)
  })

  it('round-trips reminder preferences and falls back to defaults on bad data', async () => {
    const prefs = { ...DEFAULT_REMINDERS, enabled: true, tasks: false, classes: true, classLeadMinutes: 30, taskLeadMinutes: 60, budget: true }
    await repos.settings.setReminderPrefs(prefs)
    expect((await repos.settings.get())?.reminders).toEqual(prefs)
    await repos.db.run(`UPDATE settings SET reminder_prefs = 'not json'`)
    expect((await repos.settings.get())?.reminders.enabled).toBe(false)
  })
})

describe('terms', () => {
  it('keeps old subjects reachable after a new term and can switch back', async () => {
    const newId = await repos.settings.startSemester({ name: '2nd Semester', academicYear: '2026–2027' })
    expect(await repos.subjects.list(newId)).toHaveLength(0)
    const terms = await repos.settings.listSemesters()
    expect(terms.find((t) => t.id === semesterId)?.subjectCount).toBe(1)

    await repos.settings.setSemesterArchived(semesterId, true)
    expect((await repos.settings.getSemester(semesterId))?.archivedAt).not.toBeNull()
    await expect(repos.settings.setSemesterArchived(newId, true)).rejects.toThrow(/current term/)

    await repos.settings.switchSemester(semesterId)
    expect((await repos.settings.currentSemester())?.id).toBe(semesterId)
    expect((await repos.settings.getSemester(semesterId))?.archivedAt).toBeNull()
  })
})

describe('notes', () => {
  it('lists pinned notes first and keeps notes when their subject is deleted', async () => {
    const a = uuid()
    const b = uuid()
    await repos.notes.create(a, { title: 'OSI layers', body: '7 layers', subjectId, pinned: false })
    await repos.notes.create(b, { title: null, body: 'Bring calculator', subjectId: null, pinned: true })
    await repos.notes.create(b, { title: null, body: 'Bring calculator', subjectId: null, pinned: true })
    const list = await repos.notes.list()
    expect(list.map((n) => n.id)).toEqual([b, a])
    expect(await repos.notes.list(subjectId)).toHaveLength(1)

    await repos.subjects.remove(subjectId)
    const kept = await repos.notes.list()
    expect(kept).toHaveLength(2)
    expect(kept.find((n) => n.id === a)?.subjectId).toBeNull()
  })

  it('refuses an empty note', async () => {
    await expect(repos.notes.create(uuid(), { title: '  ', body: ' ', subjectId: null, pinned: false })).rejects.toThrow()
  })
})

describe('attendance', () => {
  it('marking the same class again changes the answer', async () => {
    const mark = (status: 'present' | 'absent') =>
      repos.academics.markAttendance({ subjectId, date: '2026-10-06', startTime: '13:00', status })
    await mark('absent')
    await mark('present')
    const rows = await repos.academics.attendanceForSubject(subjectId)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('present')
    expect(await repos.academics.attendanceOn('2026-10-06')).toHaveLength(1)
    expect(await repos.academics.attendanceForSemester(semesterId)).toHaveLength(1)
  })
})

describe('grades', () => {
  it('validates scores against the total', async () => {
    await expect(
      repos.academics.addGrade(subjectId, { title: 'Quiz 1', score: 12, maxScore: 10, weight: 1, gradedOn: null }),
    ).rejects.toThrow()
    await repos.academics.addGrade(subjectId, { title: 'Quiz 1', score: 9, maxScore: 10, weight: 1, gradedOn: '2026-10-01' })
    expect(await repos.academics.gradesForSubject(subjectId)).toHaveLength(1)
    expect(await repos.academics.gradesForSemester(semesterId)).toHaveLength(1)
  })

  it('stores a target grade on the subject', async () => {
    await repos.subjects.update(subjectId, { ...subjectInput('Networking'), targetGrade: 90 })
    expect((await repos.subjects.get(subjectId)).targetGrade).toBe(90)
  })
})

describe('exam topics', () => {
  it('counts progress and starts studying when the first topic is ticked', async () => {
    const examId = uuid()
    await repos.exams.create(
      examId,
      { title: 'Networking exam', subjectId, kind: 'exam', date: '2026-10-16', time: '10:00', coverage: null, notes: null, studyStatus: 'not_started' },
      ['OSI Model', 'TCP/IP', 'Subnetting'],
    )
    let exam = (await repos.exams.list())[0]!
    expect([exam.topicsDone, exam.topicsTotal]).toEqual([0, 3])

    const topics = await repos.exams.listTopics(examId)
    expect(topics.map((t) => t.title)).toEqual(['OSI Model', 'TCP/IP', 'Subnetting'])
    await repos.exams.setTopicDone(topics[0]!.id, true)
    await repos.exams.addTopic(examId, 'Routing')
    exam = (await repos.exams.list())[0]!
    expect([exam.topicsDone, exam.topicsTotal]).toEqual([1, 4])
    expect(exam.studyStatus).toBe('studying')

    await repos.exams.remove(examId)
    expect(await repos.exams.listTopics(examId)).toHaveLength(0)
  })
})

describe('search', () => {
  it('finds subjects, tasks, exams and notes, treating % literally', async () => {
    await repos.tasks.create(uuid(), {
      title: 'Networking review',
      subjectId,
      description: null,
      kind: 'study',
      dueDate: null,
      dueTime: null,
      priority: 'medium',
      status: 'todo',
    })
    await repos.notes.create(uuid(), { title: null, body: 'Subnet cheat sheet: 100% useful', subjectId: null, pinned: false })
    const r = await repos.insights.search('network', semesterId)
    expect(r.subjects).toHaveLength(1)
    expect(r.tasks).toHaveLength(1)
    expect((await repos.insights.search('100%', semesterId)).notes).toHaveLength(1)
    expect((await repos.insights.search('%', semesterId)).notes).toHaveLength(0)
  })
})

describe('week summary', () => {
  it('adds up the week', async () => {
    await repos.expenses.create(uuid(), { amount: 125_00, categoryId: 'cat-food', description: null, spentOn: '2026-10-06' })
    await repos.expenses.create(uuid(), { amount: 50_00, categoryId: 'cat-food', description: null, spentOn: '2026-10-13' })
    await repos.academics.markAttendance({ subjectId, date: '2026-10-07', startTime: '', status: 'late' })
    const s = await repos.insights.weekSummary('2026-10-05', '2026-10-08')
    expect(s.spent).toBe(125_00)
    expect(s.classesAttended).toBe(1)
  })
})

describe('expense templates', () => {
  it('suggests the most frequent expense first', async () => {
    for (const day of ['2026-10-01', '2026-10-02', '2026-10-03']) {
      await repos.expenses.create(uuid(), { amount: 85_00, categoryId: 'cat-food', description: 'Lunch', spentOn: day })
    }
    await repos.expenses.create(uuid(), { amount: 20_00, categoryId: 'cat-transport', description: null, spentOn: '2026-10-03' })
    const t = await repos.expenses.templates('2026-09-01')
    expect(t[0]).toMatchObject({ amount: 85_00, description: 'Lunch', categoryName: 'Food' })
    expect(t).toHaveLength(2)
  })
})

describe('backup', () => {
  it('restores everything exactly, replacing what was there', async () => {
    await repos.notes.create(uuid(), { title: 'Keep me', body: '', subjectId, pinned: false })
    await repos.expenses.create(uuid(), { amount: 85_00, categoryId: 'cat-food', description: 'Lunch', spentOn: '2026-10-01' })
    const backup = parseBackup(JSON.stringify(await repos.backup.exportAll('test')))
    expect(previewBackup(backup)).toMatchObject({ studentName: 'Alex Cruz', counts: { subjects: 1, notes: 1, expenses: 1 } })

    // Change things after the backup, then restore into the same device.
    await repos.subjects.create(semesterId, subjectInput('Extra'))
    await repos.expenses.create(uuid(), { amount: 1_00, categoryId: 'cat-food', description: null, spentOn: '2026-10-02' })
    await repos.backup.restore(backup)

    expect(await repos.subjects.list(semesterId)).toHaveLength(1)
    expect(await repos.expenses.total('2026-10-01', '2026-10-31')).toBe(85_00)
    expect((await repos.notes.list())[0]?.title).toBe('Keep me')
    expect((await repos.settings.get())?.studentName).toBe('Alex Cruz')
  })

  it('restores into a fresh install', async () => {
    const backup = await repos.backup.exportAll('test')
    const db = await emptyDb()
    await migrate(db)
    const fresh = createRepositories(db)
    await fresh.backup.restore(parseBackup(JSON.stringify(backup)))
    expect((await fresh.settings.get())?.onboardedAt).not.toBeNull()
    expect(await fresh.subjects.list(semesterId)).toHaveLength(1)
  })

  it('rejects damaged, foreign and newer files without changing anything', async () => {
    expect(() => parseBackup('not json')).toThrow(/isn't a Studex backup/)
    expect(() => parseBackup(JSON.stringify({ app: 'other' }))).toThrow(/isn't a Studex backup/)
    const backup = await repos.backup.exportAll('test')
    expect(() => parseBackup(JSON.stringify({ ...backup, schemaVersion: 99 }))).toThrow(/newer version/)
    expect(() => parseBackup(JSON.stringify({ ...backup, tables: { ...backup.tables, settings: [] } }))).toThrow()
  })

  it('rolls back completely when a row is invalid', async () => {
    const backup = await repos.backup.exportAll('test')
    const broken = parseBackup(
      JSON.stringify({ ...backup, tables: { ...backup.tables, expenses: [{ id: 'x', category_id: 'missing', amount_minor: 1, spent_on: '2026-10-01' }] } }),
    )
    await expect(repos.backup.restore(broken)).rejects.toThrow(/Nothing was changed/)
    expect(await repos.subjects.list(semesterId)).toHaveLength(1)
  })
})
