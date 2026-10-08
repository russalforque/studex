import type { Task, TaskPriority } from '@/types/models'
import type { ISODate, TimeHM } from '@/utils/dates'

export function isOverdue(task: Pick<Task, 'status' | 'dueDate' | 'dueTime'>, today: ISODate, time: TimeHM): boolean {
  if (task.status === 'completed' || !task.dueDate) return false
  if (task.dueDate < today) return true
  return task.dueDate === today && task.dueTime !== null && task.dueTime < time
}

const PRIORITY_RANK: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 }

/** Earliest due first (undated last), then time, then priority. */
export function compareTasks(a: Task, b: Task): number {
  if (a.dueDate !== b.dueDate) {
    if (!a.dueDate) return 1
    if (!b.dueDate) return -1
    return a.dueDate.localeCompare(b.dueDate)
  }
  if (a.dueTime !== b.dueTime) {
    if (!a.dueTime) return 1
    if (!b.dueTime) return -1
    return a.dueTime.localeCompare(b.dueTime)
  }
  return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
}

export type TaskFilter = 'today' | 'upcoming' | 'overdue' | 'completed'

export interface TaskGroups {
  overdue: Task[]
  today: Task[]
  /** Completed today — kept visible on the Today list for a sense of progress. */
  doneToday: Task[]
  upcoming: Task[]
  someday: Task[]
  completed: Task[]
}

export function groupTasks(tasks: Task[], today: ISODate, time: TimeHM): TaskGroups {
  const g: TaskGroups = { overdue: [], today: [], doneToday: [], upcoming: [], someday: [], completed: [] }
  for (const t of tasks) {
    if (t.status === 'completed') {
      g.completed.push(t)
      if (t.dueDate === today) g.doneToday.push(t)
      continue
    }
    if (isOverdue(t, today, time)) g.overdue.push(t)
    else if (t.dueDate === today) g.today.push(t)
    else if (t.dueDate) g.upcoming.push(t)
    else g.someday.push(t)
  }
  for (const list of [g.overdue, g.today, g.upcoming, g.someday, g.doneToday]) list.sort(compareTasks)
  g.completed.sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
  return g
}
