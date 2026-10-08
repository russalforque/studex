import type { ClassSlotView, Exam, PlannedExpense, StudySession, Task } from '@/types/models'
import { dayOfWeek, nowTime, toISODate, type ISODate, type TimeHM } from '@/utils/dates'
import { slotsForDay } from './schedule'

export type AgendaItem =
  | { kind: 'class'; key: string; time: TimeHM; endTime: TimeHM; slot: ClassSlotView }
  | { kind: 'exam'; key: string; time: TimeHM | null; exam: Exam }
  | { kind: 'task'; key: string; time: TimeHM | null; task: Task; overdue: boolean }
  | { kind: 'study'; key: string; time: TimeHM; session: StudySession }
  | { kind: 'planned'; key: string; time: null; planned: PlannedExpense }

/** Planned expenses never have a time, so they never appear here. */
export type TimedAgendaItem = Exclude<AgendaItem, { kind: 'planned' }> & { time: TimeHM }

export interface Agenda {
  /** Things with a time, in time order. */
  timed: TimedAgendaItem[]
  /** Due some time that day (and, for today, anything overdue). */
  anytime: AgendaItem[]
}

/** Same time: classes first, then exams, tasks, study sessions. */
const ORDER: Record<AgendaItem['kind'], number> = { class: 0, exam: 1, task: 2, study: 3, planned: 4 }

/**
 * One day's plan from the records that already exist: classes from the timetable, tasks and
 * exams due that day, study sessions done that day and planned expenses due. Nothing is copied
 * or stored; each item points back at its own record.
 */
export function buildAgenda(input: {
  date: ISODate
  today: ISODate
  slots: ClassSlotView[]
  tasks: Task[]
  exams: Exam[]
  sessions: StudySession[]
  planned: PlannedExpense[]
}): Agenda {
  const { date, today, slots, tasks, exams, sessions, planned } = input
  const items: AgendaItem[] = []

  for (const s of slotsForDay(slots, dayOfWeek(date))) {
    items.push({ kind: 'class', key: `class-${s.id}`, time: s.startTime, endTime: s.endTime, slot: s })
  }
  for (const e of exams) {
    if (e.date === date) items.push({ kind: 'exam', key: `exam-${e.id}`, time: e.time, exam: e })
  }
  for (const t of tasks) {
    const due = t.dueDate === date && (t.status !== 'completed' || date === today)
    const overdue = date === today && t.status !== 'completed' && !!t.dueDate && t.dueDate < today
    if (due || overdue) items.push({ kind: 'task', key: `task-${t.id}`, time: overdue ? null : t.dueTime, task: t, overdue })
  }
  for (const s of sessions) {
    const start = new Date(s.startedAt)
    if (toISODate(start) === date) items.push({ kind: 'study', key: `study-${s.id}`, time: nowTime(start), session: s })
  }
  for (const p of planned) {
    if (!p.expenseId && p.dueDate === date) items.push({ kind: 'planned', key: `planned-${p.id}`, time: null, planned: p })
  }

  const timed = items
    .filter((i): i is TimedAgendaItem => i.time !== null)
    .sort((a, b) => a.time.localeCompare(b.time) || ORDER[a.kind] - ORDER[b.kind])
  const anytime = items
    .filter((i) => i.time === null)
    .sort((a, b) => Number(isOverdue(b)) - Number(isOverdue(a)) || ORDER[a.kind] - ORDER[b.kind])
  return { timed, anytime }
}

const isOverdue = (i: AgendaItem) => i.kind === 'task' && i.overdue
