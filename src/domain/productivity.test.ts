import { describe, expect, it } from 'vitest'
import { DAY_BEFORE, DEFAULT_REMINDERS, type ClassSlotView, type Exam, type GradeCategory, type PlannedExpense, type StudySession, type Task } from '@/types/models'
import { buildAgenda } from './agenda'
import { attendanceStanding, attendanceStats, parseAttendanceRules } from './attendance'
import { summarizeBudget } from './budget'
import {
  elapsedMs,
  endsAt,
  formatClock,
  isFinished,
  parseFocusState,
  pause,
  remainingMs,
  resume,
  sessionRecord,
  startBreak,
  startFocus,
} from './focus'
import { gradeEstimate, gradeSummary } from './grades'
import { nextOccurrence, occurrencesBetween, unhandledOccurrences } from './recurring'
import { FOCUS_NOTIFICATION_ID, MAX_REMINDERS, planReminders } from './reminders'
import { conflictsFor, findConflicts, overlapMinutes } from './schedule'

const MIN = 60_000
const T0 = Date.UTC(2026, 9, 8, 1, 0, 0)

describe('focus timer', () => {
  const start = () => startFocus({ sessionId: 's1', subjectId: 'sub', minutes: 25, breakMinutes: null, now: T0 })

  it('counts from timestamps, so time passes while the app is closed or the phone is locked', () => {
    const s = start()
    // No ticks happen in between: only the clock is read.
    expect(elapsedMs(s, T0 + 10 * MIN)).toBe(10 * MIN)
    expect(formatClock(remainingMs(s, T0 + 10 * MIN))).toBe('15:00')
    expect(isFinished(s, T0 + 25 * MIN)).toBe(true)
    // Reopening long after the end never goes past the planned length.
    expect(elapsedMs(s, T0 + 5 * 60 * MIN)).toBe(25 * MIN)
  })

  it('stops counting while paused and resumes where it left off', () => {
    let s = start()
    s = pause(s, T0 + 5 * MIN)
    expect(elapsedMs(s, T0 + 60 * MIN)).toBe(5 * MIN)
    expect(endsAt(s)).toBeNull()
    s = resume(s, T0 + 60 * MIN)
    expect(elapsedMs(s, T0 + 70 * MIN)).toBe(15 * MIN)
    expect(endsAt(s)).toBe(T0 + 80 * MIN)
    // Pausing or resuming twice changes nothing.
    expect(resume(s, T0 + 75 * MIN)).toBe(s)
  })

  it('ignores the clock moving backwards', () => {
    expect(elapsedMs(start(), T0 - 10 * MIN)).toBe(0)
  })

  it('records a finished session at the moment it ended, not when the app noticed', () => {
    const rec = sessionRecord(start(), T0 + 3 * 60 * MIN)!
    expect(rec.status).toBe('completed')
    expect(rec.focusedSeconds).toBe(25 * 60)
    expect(rec.endedAt).toBe(new Date(T0 + 25 * MIN).toISOString())
  })

  it('records an ended-early session as interrupted, and drops one under a minute', () => {
    const rec = sessionRecord(start(), T0 + 12 * MIN + 30_000)!
    expect(rec.status).toBe('interrupted')
    expect(rec.focusedSeconds).toBe(12 * 60 + 30)
    expect(sessionRecord(start(), T0 + 40_000)).toBeNull()
  })

  it('never records breaks', () => {
    const b = startBreak({ ...start(), breakSeconds: 300 }, 'b1', T0)
    expect(b.plannedSeconds).toBe(300)
    expect(sessionRecord(b, T0 + 10 * MIN)).toBeNull()
  })

  it('validates the length and survives malformed saved state', () => {
    expect(() => startFocus({ sessionId: 'x', subjectId: null, minutes: 0, breakMinutes: null, now: T0 })).toThrow()
    expect(() => startFocus({ sessionId: 'x', subjectId: null, minutes: 600, breakMinutes: null, now: T0 })).toThrow()
    expect(parseFocusState('{oops')).toBeNull()
    expect(parseFocusState(JSON.stringify({ sessionId: 1 }))).toBeNull()
    expect(parseFocusState(JSON.stringify(start()))).toEqual(start())
  })

  it('formats long sessions with hours', () => {
    expect(formatClock(65 * MIN)).toBe('1:05:00')
    expect(formatClock(0)).toBe('00:00')
  })
})

describe('recurring expenses', () => {
  const weekly = { frequency: 'weekly' as const, intervalDays: null, startDate: '2026-09-07', endDate: null }

  it('lists due dates from the start date', () => {
    expect(occurrencesBetween(weekly, '2026-09-01', '2026-09-30')).toEqual(['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28'])
  })

  it('clamps monthly dates to short months', () => {
    const rule = { frequency: 'monthly' as const, intervalDays: null, startDate: '2026-01-31', endDate: null }
    expect(occurrencesBetween(rule, '2026-01-01', '2026-04-30')).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'])
  })

  it('respects the end date and custom intervals', () => {
    const rule = { frequency: 'custom' as const, intervalDays: 3, startDate: '2026-10-01', endDate: '2026-10-08' }
    expect(occurrencesBetween(rule, '2026-09-01', '2026-12-01')).toEqual(['2026-10-01', '2026-10-04', '2026-10-07'])
    expect(nextOccurrence(rule, '2026-10-07')).toBeNull()
    expect(nextOccurrence(rule, '2026-10-01')).toBe('2026-10-04')
  })

  it('leaves out dates already handled', () => {
    const handled = new Set(['2026-09-07', '2026-09-21'])
    expect(unhandledOccurrences(weekly, '2026-09-28', handled)).toEqual(['2026-09-14', '2026-09-28'])
  })
})

describe('safe to spend with reserved planned expenses', () => {
  const base = {
    period: { start: '2026-10-05', end: '2026-10-11' },
    today: '2026-10-07',
    income: 1500_00,
    saved: 0,
    spentBeforeToday: 300_00,
    spentToday: 0,
    spendingDays: [],
  }

  it('takes reserved money out before sharing the rest across the days', () => {
    const without = summarizeBudget(base)
    const withReserve = summarizeBudget({ ...base, reserved: 350_00 })
    // 1200 left over 5 days vs (1200 - 350) over 5 days.
    expect(without.dailyAllowance).toBe(240_00)
    expect(withReserve.dailyAllowance).toBe(170_00)
    expect(withReserve.free).toBe(850_00)
    // Reserving doesn't count as spending.
    expect(withReserve.spent).toBe(300_00)
    expect(withReserve.remaining).toBe(1200_00)
  })

  it('never goes below zero', () => {
    expect(summarizeBudget({ ...base, reserved: 5000_00 }).safeToSpendToday).toBe(0)
  })
})

describe('grades', () => {
  const cats: GradeCategory[] = [
    { id: 'q', subjectId: 's', name: 'Quizzes', weight: 30 },
    { id: 'e', subjectId: 's', name: 'Exams', weight: 70 },
  ]

  it('ignores ungraded items in the plain estimate', () => {
    expect(gradeEstimate([{ score: 9, maxScore: 10, weight: 1 }, { score: null, maxScore: 50, weight: 1 }])).toBe(90)
  })

  it('weights categories and re-scales over the ones with grades', () => {
    const items = [
      { categoryId: 'q', score: 8, maxScore: 10, weight: 1 },
      { categoryId: 'q', score: 10, maxScore: 10, weight: 1 },
      { categoryId: 'e', score: null, maxScore: 100, weight: 1 },
    ]
    // Only quizzes graded: 90% of what's graded so far.
    const s = gradeSummary(items, cats, 90)
    expect(s.estimate).toBe(90)
    expect(s.pending).toBe(1)
    // 0.3·90 + 0.7·x = 90 → x = 90.
    expect(s.needed).toBe(90)
    expect(s.outlook).toBe('reachable')
  })

  it('works out what is needed on the remaining work', () => {
    const items = [
      { categoryId: 'q', score: 60, maxScore: 100, weight: 1 },
      { categoryId: 'e', score: 70, maxScore: 100, weight: 1 },
      { categoryId: 'e', score: null, maxScore: 100, weight: 1 },
    ]
    // final(x) = 0.3·60 + 0.7·(70 + x)/2 = 42.5 + 0.35x
    expect(gradeSummary(items, cats, 85).needed).toBe(121.4)
    expect(gradeSummary(items, cats, 85).outlook).toBe('out_of_reach')
    expect(gradeSummary(items, cats, 40).outlook).toBe('secured')
    expect(gradeSummary(items, cats, 75).needed).toBe(92.9)
  })

  it('has nothing to project without ungraded items or a target', () => {
    const items = [{ categoryId: 'q', score: 9, maxScore: 10, weight: 1 }]
    expect(gradeSummary(items, cats, 90).needed).toBeNull()
    expect(gradeSummary([{ ...items[0]!, score: null }], cats, null).needed).toBeNull()
  })

  it('gives uncategorised items the weight left over, or ignores them when there is none', () => {
    const partial: GradeCategory[] = [{ id: 'q', subjectId: 's', name: 'Quizzes', weight: 40 }]
    const items = [
      { categoryId: 'q', score: 100, maxScore: 100, weight: 1 },
      { categoryId: null, score: 50, maxScore: 100, weight: 1 },
    ]
    // 0.4·100 + 0.6·50 = 70
    expect(gradeSummary(items, partial, null).estimate).toBe(70)
    expect(gradeSummary(items, cats, null).ignored).toBe(1)
  })
})

describe('attendance rules', () => {
  const rec = (status: 'present' | 'late' | 'absent' | 'excused', n: number) => Array.from({ length: n }, () => ({ status }))
  const records = [...rec('present', 7), ...rec('late', 2), ...rec('absent', 1), ...rec('excused', 2)]

  it('counts late as attended and leaves excused out by default', () => {
    const s = attendanceStats(records)
    expect(s.total).toBe(12)
    expect(s.counted).toBe(10)
    expect(s.rate).toBe(90)
  })

  it('follows other school policies', () => {
    expect(attendanceStats(records, { late: 'half', excused: 'skip' }).exactRate).toBe(80)
    expect(attendanceStats(records, { late: 'absent', excused: 'present' }).rate).toBe(75)
  })

  it('says how many classes can still be missed, or how many to attend to recover', () => {
    const s = attendanceStats(records)
    // 9/10 at 80%: one more absence gives 9/11 = 81.8%, two give 9/12 = 75%.
    expect(attendanceStanding(s, 80)).toEqual({ kind: 'close', canMiss: 1 })
    expect(attendanceStanding(s, 70)).toEqual({ kind: 'ok', canMiss: 2 })
    expect(attendanceStanding(s, 90)).toEqual({ kind: 'close', canMiss: 0 })
    // 9/10 attended; 95% needs (9 + n)/(10 + n) ≥ .95 → n = 10.
    expect(attendanceStanding(s, 95)).toEqual({ kind: 'below', toRecover: 10 })
    expect(attendanceStanding(s, null)).toEqual({ kind: 'none' })
  })

  it('parses saved rules defensively', () => {
    expect(parseAttendanceRules('nope')).toEqual({ late: 'present', excused: 'skip' })
    expect(parseAttendanceRules('{"late":"half","excused":"bogus"}')).toEqual({ late: 'half', excused: 'skip' })
  })
})

describe('timetable conflicts', () => {
  const slot = (id: string, day: number, start: string, end: string) => ({ id, dayOfWeek: day, startTime: start, endTime: end })

  it('measures the overlap', () => {
    expect(overlapMinutes(slot('a', 1, '10:00', '11:30'), slot('b', 1, '11:00', '12:30'))).toBe(30)
    expect(overlapMinutes(slot('a', 1, '10:00', '11:00'), slot('b', 1, '11:00', '12:00'))).toBe(0)
    expect(overlapMinutes(slot('a', 1, '10:00', '11:30'), slot('b', 2, '11:00', '12:30'))).toBe(0)
  })

  it('finds every overlapping pair, including a long class overlapping two others', () => {
    const slots = [slot('a', 1, '08:00', '12:00'), slot('b', 1, '09:00', '10:00'), slot('c', 1, '11:00', '13:00'), slot('d', 2, '08:00', '09:00')]
    expect(findConflicts(slots).map((c) => [c.a.id, c.b.id, c.minutes])).toEqual([
      ['a', 'b', 60],
      ['a', 'c', 60],
    ])
  })

  it('checks a proposal on each chosen day and ignores the slot being edited', () => {
    const slots = [slot('a', 1, '10:00', '11:30'), slot('b', 3, '10:00', '11:30')]
    expect(conflictsFor({ days: [1, 3, 5], startTime: '11:00', endTime: '12:30' }, slots).map((c) => [c.slot.id, c.minutes])).toEqual([
      ['a', 30],
      ['b', 30],
    ])
    expect(conflictsFor({ id: 'a', days: [1], startTime: '10:00', endTime: '11:00' }, slots)).toEqual([])
  })
})

describe('daily agenda', () => {
  const slot: ClassSlotView = {
    id: 'c1', subjectId: 's', dayOfWeek: 4, startTime: '09:00', endTime: '10:30', room: null,
    subjectName: 'Database Systems', subjectColor: '#000000', instructor: null, displayRoom: 'Room 204',
  }
  const task = (id: string, dueDate: string | null, dueTime: string | null, status: Task['status'] = 'todo'): Task => ({
    id, subjectId: null, subjectName: null, subjectColor: null, title: id, description: null, kind: 'assignment',
    dueDate, dueTime, priority: 'medium', status, completedAt: null, createdAt: '',
  })
  const exam = { id: 'e1', date: '2026-10-08', time: null, title: 'Quiz' } as unknown as Exam
  const session = { id: 'st', startedAt: new Date(2026, 9, 8, 13, 0).toISOString() } as unknown as StudySession
  const planned = { id: 'p1', dueDate: '2026-10-08', expenseId: null } as unknown as PlannedExpense

  it('merges every source in time order, with untimed things apart', () => {
    const a = buildAgenda({
      date: '2026-10-08',
      today: '2026-10-08',
      slots: [slot],
      tasks: [task('late one', '2026-10-01', null), task('assignment', '2026-10-08', '17:00'), task('done', '2026-10-08', null, 'completed')],
      exams: [exam],
      sessions: [session],
      planned: [planned],
    })
    expect(a.timed.map((i) => i.kind)).toEqual(['class', 'study', 'task'])
    expect(a.anytime.map((i) => i.key)).toEqual(['task-late one', 'exam-e1', 'task-done', 'planned-p1'])
  })

  it('shows overdue tasks only on today', () => {
    const a = buildAgenda({ date: '2026-10-09', today: '2026-10-08', slots: [], tasks: [task('late', '2026-10-01', null)], exams: [], sessions: [], planned: [] })
    expect(a.anytime).toEqual([])
  })
})

describe('reminder timing', () => {
  const now = new Date(2026, 9, 8, 8, 0)
  const task = (title: string, dueDate: string, dueTime: string | null): Task => ({
    id: title, subjectId: null, subjectName: null, subjectColor: null, title, description: null, kind: 'assignment',
    dueDate, dueTime, priority: 'medium', status: 'todo', completedAt: null, createdAt: '',
  })
  const on = { ...DEFAULT_REMINDERS, enabled: true }

  it('reminds a set time before a timed task, and in the morning for untimed ones', () => {
    const planned = planReminders({
      prefs: { ...on, taskLeadMinutes: 30 },
      tasks: [task('Lab report', '2026-10-09', '17:00'), task('Reading', '2026-10-09', null)],
      exams: [],
      slots: [],
      now,
    })
    expect(planned.map((r) => [r.at.getHours(), r.at.getMinutes(), r.title])).toEqual([
      [7, 30, 'Due today'],
      [16, 30, 'Lab report'],
    ])
  })

  it('keeps the evening-before message for "1 day before"', () => {
    const planned = planReminders({ prefs: { ...on, taskLeadMinutes: DAY_BEFORE }, tasks: [task('A', '2026-10-09', '09:00')], exams: [], slots: [], now })
    expect(planned).toHaveLength(1)
    expect(planned[0]!.at.getHours()).toBe(19)
  })

  it('plans unpaid school expenses and leaves the focus id free', () => {
    const p = { id: 'p', title: 'Printing', amount: 120_00, dueDate: '2026-10-10', expenseId: null } as unknown as PlannedExpense
    const paid = { ...p, id: 'q', expenseId: 'x' }
    const planned = planReminders({ prefs: on, tasks: [], exams: [], slots: [], planned: [p, paid], now })
    expect(planned.map((r) => r.title)).toEqual(['Printing is due today'])
    expect(Math.max(...planned.map((r) => r.id))).toBeLessThanOrEqual(MAX_REMINDERS)
    expect(FOCUS_NOTIFICATION_ID).toBeGreaterThan(MAX_REMINDERS)
  })
})
