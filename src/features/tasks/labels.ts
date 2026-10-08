import type { TaskKind, TaskPriority } from '@/types/models'

export const KIND_LABEL: Record<TaskKind, string> = {
  assignment: 'Assignment',
  project: 'Project',
  homework: 'Homework',
  study: 'Study',
  personal: 'Personal',
}

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: 'Low priority',
  medium: 'Medium priority',
  high: 'High priority',
}
