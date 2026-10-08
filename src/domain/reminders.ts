import { DAY_BEFORE, type ClassSlotView, type Exam, type ExamKind, type PlannedExpense, type ReminderPrefs, type Task } from '@/types/models'
import { addDays, dayOfWeek, formatDuration, formatTime, toISODate, type ISODate, type TimeHM } from '@/utils/dates'
import { formatMoney } from '@/utils/money'
import { slotsForDay } from './schedule'

export interface PlannedReminder {
  id: number
  at: Date
  title: string
  body: string
  /** Screen to open when the notification is tapped. */
  route: string
}

/** iOS keeps at most 64 pending notifications per app; stay under it, leaving room for the focus timer. */
export const MAX_REMINDERS = 60
/** Planned reminders use ids 1…MAX_REMINDERS; the focus timer has its own, which re-planning never cancels. */
export const FOCUS_NOTIFICATION_ID = 9001
const DAYS_AHEAD = 7
/** Evening-before reminders go out at this local time. */
const EVENING = '19:00'
/** Things due on a day without a time are mentioned that morning. */
const MORNING = '07:30'
const BUDGET_EVENING = '20:30'

const KIND_WORD: Record<ExamKind, string> = { exam: 'exam', quiz: 'quiz', presentation: 'presentation', project: 'project' }

function at(date: ISODate, time: TimeHM): Date {
  const [y, m, d] = date.split('-').map(Number)
  const [h, mi] = time.split(':').map(Number)
  return new Date(y!, m! - 1, d!, h!, mi!)
}

function listTitles(titles: string[]): string {
  if (titles.length <= 1) return titles[0] ?? ''
  if (titles.length === 2) return `${titles[0]} and ${titles[1]}`
  return `${titles.slice(0, 2).join(', ')} and ${titles.length - 2} more`
}

const leadText = (minutes: number) => (minutes === 0 ? 'now' : `in ${formatDuration(minutes)}`)

/**
 * Plans the next week of local notifications. Pure, so it can be tested and re-run after every
 * change: callers cancel what is pending and schedule this list.
 *
 * Kept deliberately quiet: with "1 day before", one evening message per day for everything due
 * the next day and one per exam. Shorter lead times remind before each timed task or exam, with
 * one morning message for anything due that day without a time.
 */
export function planReminders(input: {
  prefs: ReminderPrefs
  tasks: Task[]
  exams: Exam[]
  slots: ClassSlotView[]
  planned?: PlannedExpense[]
  currency?: string
  now: Date
}): PlannedReminder[] {
  const { prefs, tasks, exams, slots, planned = [], currency = 'PHP', now } = input
  if (!prefs.enabled) return []
  const today = toISODate(now)
  const out: Omit<PlannedReminder, 'id'>[] = []
  const push = (r: Omit<PlannedReminder, 'id'>) => {
    if (r.at > now) out.push(r)
  }
  const openTasks = tasks.filter((t) => t.status !== 'completed' && t.dueDate)
  const openExams = exams.filter((e) => e.studyStatus !== 'completed')

  for (let i = 0; i <= DAYS_AHEAD; i++) {
    const day = addDays(today, i)
    const tomorrow = addDays(day, 1)
    const evening = at(day, EVENING)
    const morning = at(day, MORNING)

    if (prefs.tasks) {
      if (prefs.taskLeadMinutes >= DAY_BEFORE) {
        const due = openTasks
          .filter((t) => t.dueDate === tomorrow)
          .sort((a, b) => (a.dueTime ?? '99').localeCompare(b.dueTime ?? '99'))
        if (due.length === 1) {
          const t = due[0]!
          push({
            at: evening,
            title: 'Due tomorrow',
            body: `${t.title} is due tomorrow${t.dueTime ? ` at ${formatTime(t.dueTime)}` : ''}.`,
            route: '/tasks',
          })
        } else if (due.length > 1) {
          push({ at: evening, title: `${due.length} tasks due tomorrow`, body: `${listTitles(due.map((t) => t.title))}.`, route: '/tasks' })
        }
      } else {
        const dueToday = openTasks.filter((t) => t.dueDate === day)
        const untimed = dueToday.filter((t) => !t.dueTime)
        if (untimed.length > 0) {
          push({
            at: morning,
            title: untimed.length === 1 ? 'Due today' : `${untimed.length} tasks due today`,
            body: `${listTitles(untimed.map((t) => t.title))}.`,
            route: '/tasks',
          })
        }
        for (const t of dueToday.filter((x) => x.dueTime)) {
          push({
            at: new Date(at(day, t.dueTime!).getTime() - prefs.taskLeadMinutes * 60_000),
            title: t.title,
            body: `Due ${leadText(prefs.taskLeadMinutes)} (${formatTime(t.dueTime!)}).`,
            route: '/tasks',
          })
        }
      }
    }

    if (prefs.exams) {
      if (prefs.examLeadMinutes >= DAY_BEFORE) {
        for (const e of openExams.filter((x) => x.date === tomorrow)) {
          const topics = e.topicsTotal > 0 ? ` ${e.topicsDone} of ${e.topicsTotal} topics reviewed.` : ''
          push({
            at: evening,
            title: e.title,
            body: `You have a ${KIND_WORD[e.kind]} tomorrow${e.time ? ` at ${formatTime(e.time)}` : ''}.${topics}`,
            route: '/exams',
          })
        }
      } else {
        for (const e of openExams.filter((x) => x.date === day)) {
          push(
            e.time
              ? {
                  at: new Date(at(day, e.time).getTime() - prefs.examLeadMinutes * 60_000),
                  title: e.title,
                  body: `Your ${KIND_WORD[e.kind]} starts ${leadText(prefs.examLeadMinutes)} (${formatTime(e.time)}).`,
                  route: '/exams',
                }
              : { at: morning, title: e.title, body: `You have a ${KIND_WORD[e.kind]} today.`, route: '/exams' },
          )
        }
      }
    }

    if (prefs.classes) {
      for (const s of slotsForDay(slots, dayOfWeek(day))) {
        const start = at(day, s.startTime)
        push({
          at: new Date(start.getTime() - prefs.classLeadMinutes * 60_000),
          title: `${s.subjectName} starts in ${prefs.classLeadMinutes} minutes`,
          body: [formatTime(s.startTime), s.displayRoom].filter(Boolean).join(' · '),
          route: '/schedule',
        })
      }
    }

    if (prefs.planned) {
      const due = planned.filter((p) => !p.expenseId && p.dueDate === day)
      if (due.length > 0) {
        const total = due.reduce((n, p) => n + p.amount, 0)
        push({
          at: morning,
          title: due.length === 1 ? `${due[0]!.title} is due today` : `${due.length} school expenses due today`,
          body: `${formatMoney(total, currency)} planned${due.length > 1 ? `: ${listTitles(due.map((p) => p.title))}` : ''}.`,
          route: '/budget/planned',
        })
      }
    }

    if (prefs.budget) {
      push({ at: at(day, BUDGET_EVENING), title: 'Anything spent today?', body: 'Log it now so Safe to spend stays right.', route: '/budget' })
    }
  }

  return out
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, MAX_REMINDERS)
    .map((r, i) => ({ ...r, id: i + 1 }))
}
