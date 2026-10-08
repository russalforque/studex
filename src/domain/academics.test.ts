import { describe, expect, it } from 'vitest'
import { DEFAULT_REMINDERS, type ClassSlotView, type Exam, type Task } from '@/types/models'
import { attendanceNote, attendanceStats, classToMark } from './attendance'
import { gradeEstimate, targetStatus } from './grades'
import { MAX_REMINDERS, planReminders } from './reminders'

describe('gradeEstimate', () => {
  it('averages percentages, honouring weights', () => {
    expect(gradeEstimate([])).toBeNull()
    expect(gradeEstimate([{ score: 9, maxScore: 10, weight: 1 }, { score: 40, maxScore: 50, weight: 1 }])).toBe(85)
    expect(gradeEstimate([{ score: 9, maxScore: 10, weight: 1 }, { score: 40, maxScore: 50, weight: 3 }])).toBe(82.5)
  })
  it('describes progress toward a target', () => {
    expect(targetStatus(91, 90)).toBe('met')
    expect(targetStatus(88, 90)).toBe('close')
    expect(targetStatus(80, 90)).toBe('below')
  })
})

describe('attendance', () => {
  it('counts late as attended and leaves excused out', () => {
    const s = attendanceStats([{ status: 'present' }, { status: 'late' }, { status: 'absent' }, { status: 'excused' }])
    expect(s).toMatchObject({ present: 1, late: 1, absent: 1, excused: 1, rate: 67 })
    expect(attendanceStats([]).rate).toBeNull()
  })

  it('mentions a pattern only after repeated recent absences', () => {
    const r = (date: string, status: 'present' | 'absent') => ({ date, status, startTime: '' })
    expect(attendanceNote([r('2026-10-01', 'absent'), r('2026-10-02', 'present'), r('2026-10-03', 'present')])).toBeNull()
    expect(attendanceNote([r('2026-10-01', 'absent'), r('2026-10-02', 'absent'), r('2026-10-03', 'present')])).toBe(
      'You missed 2 of your last 3 classes.',
    )
  })

  it('asks about the latest class that ended today and is not marked', () => {
    const slot = (subjectId: string, start: string, end: string): ClassSlotView => ({
      id: subjectId + start,
      subjectId,
      dayOfWeek: 4, // Thursday 2026-10-08
      startTime: start,
      endTime: end,
      room: null,
      subjectName: subjectId,
      subjectColor: '#000000',
      instructor: null,
      displayRoom: null,
    })
    const slots = [slot('a', '08:00', '09:00'), slot('b', '10:00', '11:00'), slot('c', '13:00', '14:00')]
    expect(classToMark(slots, [], '2026-10-08', '07:00')).toBeNull()
    expect(classToMark(slots, [], '2026-10-08', '11:30')?.subjectId).toBe('b')
    const marked = [{ subjectId: 'b', date: '2026-10-08', startTime: '10:00' }]
    expect(classToMark(slots, marked, '2026-10-08', '11:30')?.subjectId).toBe('a')
  })
})

describe('planReminders', () => {
  const now = new Date(2026, 9, 8, 12, 0) // Thu 8 Oct 2026, noon
  const task = (title: string, dueDate: string, extra: Partial<Task> = {}): Task => ({
    id: title,
    subjectId: null,
    subjectName: null,
    subjectColor: null,
    title,
    description: null,
    kind: 'assignment',
    dueDate,
    dueTime: null,
    priority: 'medium',
    status: 'todo',
    completedAt: null,
    createdAt: '',
    ...extra,
  })
  const exam: Exam = {
    id: 'e',
    subjectId: null,
    subjectName: null,
    subjectColor: null,
    title: 'Networking',
    kind: 'quiz',
    date: '2026-10-10',
    time: '10:00',
    coverage: null,
    notes: null,
    studyStatus: 'studying',
    topicsTotal: 5,
    topicsDone: 3,
  }
  const on = { ...DEFAULT_REMINDERS, enabled: true }

  it('plans nothing when reminders are off', () => {
    expect(planReminders({ prefs: DEFAULT_REMINDERS, tasks: [task('A', '2026-10-09')], exams: [], slots: [], now })).toEqual([])
  })

  it('sends one evening message per day for tasks due the next day', () => {
    const r = planReminders({
      prefs: on,
      tasks: [task('A', '2026-10-09'), task('B', '2026-10-09'), task('Done', '2026-10-09', { status: 'completed' }), task('C', '2026-10-12')],
      exams: [],
      slots: [],
      now,
    })
    expect(r).toHaveLength(2)
    expect(r[0]).toMatchObject({ title: '2 tasks due tomorrow', body: 'A and B.' })
    expect(r[0]!.at).toEqual(new Date(2026, 9, 8, 19, 0))
    expect(r[1]!.body).toBe('C is due tomorrow.')
  })

  it('skips evening messages whose time has passed', () => {
    const late = new Date(2026, 9, 8, 20, 0)
    expect(planReminders({ prefs: on, tasks: [task('A', '2026-10-09')], exams: [], slots: [], now: late })).toEqual([])
  })

  it('reminds about exams with study progress', () => {
    const [r] = planReminders({ prefs: on, tasks: [], exams: [exam], slots: [], now })
    expect(r?.title).toBe('Networking')
    expect(r?.body).toMatch(/^You have a quiz tomorrow at .+\. 3 of 5 topics reviewed\.$/)
  })

  it('reminds before classes only when asked, and stays under the platform limit', () => {
    const slots: ClassSlotView[] = [0, 1, 2, 3, 4, 5, 6].flatMap((d) =>
      Array.from({ length: 12 }, (_, h) => ({
        id: `${d}-${h}`,
        subjectId: 's',
        dayOfWeek: d,
        startTime: `${String(7 + h).padStart(2, '0')}:00`,
        endTime: `${String(7 + h).padStart(2, '0')}:50`,
        room: null,
        subjectName: 'Web Dev',
        subjectColor: '#000000',
        instructor: null,
        displayRoom: 'Room 304',
      })),
    )
    expect(planReminders({ prefs: on, tasks: [], exams: [], slots, now })).toHaveLength(0)
    const r = planReminders({ prefs: { ...on, classes: true, classLeadMinutes: 30 }, tasks: [], exams: [], slots, now })
    expect(r).toHaveLength(MAX_REMINDERS)
    expect(r[0]!.title).toBe('Web Dev starts in 30 minutes')
    expect(r[0]!.at > now).toBe(true)
  })
})
