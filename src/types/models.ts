import type { ISODate, TimeHM } from '@/utils/dates'
import type { Minor } from '@/utils/money'

export type ID = string

export interface Settings {
  studentName: string
  schoolName: string | null
  currency: string
  /** Days of week (0 = Sunday) that count toward "Safe to spend". */
  spendingDays: number[]
  currentSemesterId: ID | null
  onboardedAt: string | null
}

export interface Semester {
  id: ID
  name: string
  academicYear: string | null
  createdAt: string
}

export interface Subject {
  id: ID
  semesterId: ID
  name: string
  code: string | null
  instructor: string | null
  room: string | null
  color: string
  notes: string | null
}

export interface ClassSlot {
  id: ID
  subjectId: ID
  dayOfWeek: number
  startTime: TimeHM
  endTime: TimeHM
  /** Overrides the subject's default room when set. */
  room: string | null
}

/** A class slot joined with the subject details needed to display it. */
export interface ClassSlotView extends ClassSlot {
  subjectName: string
  subjectColor: string
  instructor: string | null
  displayRoom: string | null
}

export const TASK_KINDS = ['assignment', 'project', 'homework', 'study', 'personal'] as const
export type TaskKind = (typeof TASK_KINDS)[number]
export const TASK_PRIORITIES = ['low', 'medium', 'high'] as const
export type TaskPriority = (typeof TASK_PRIORITIES)[number]
export const TASK_STATUSES = ['todo', 'in_progress', 'completed'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export interface Task {
  id: ID
  subjectId: ID | null
  subjectName: string | null
  subjectColor: string | null
  title: string
  description: string | null
  kind: TaskKind
  dueDate: ISODate | null
  dueTime: TimeHM | null
  priority: TaskPriority
  status: TaskStatus
  completedAt: string | null
  createdAt: string
}

export const EXAM_KINDS = ['exam', 'quiz', 'presentation', 'project'] as const
export type ExamKind = (typeof EXAM_KINDS)[number]
export const STUDY_STATUSES = ['not_started', 'studying', 'ready', 'completed'] as const
export type StudyStatus = (typeof STUDY_STATUSES)[number]

export interface Exam {
  id: ID
  subjectId: ID | null
  subjectName: string | null
  subjectColor: string | null
  title: string
  kind: ExamKind
  date: ISODate
  time: TimeHM | null
  coverage: string | null
  notes: string | null
  studyStatus: StudyStatus
}

export const FREQUENCIES = ['daily', 'weekly', 'biweekly', 'monthly', 'custom'] as const
export type Frequency = (typeof FREQUENCIES)[number]

export interface AllowancePlan {
  id: ID
  amount: Minor
  frequency: Frequency
  /** Only for `custom`: allowance arrives every N days. */
  intervalDays: number | null
  /** First day of any one period; all other periods are derived from it. */
  anchorDate: ISODate
  savingsAmount: Minor
  savingsGoalId: ID | null
  /** Scheduled allowance rows are generated from this date onward. */
  effectiveFrom: ISODate
}

export type IncomeKind = 'scheduled' | 'extra'

export interface Income {
  id: ID
  planId: ID | null
  kind: IncomeKind
  amount: Minor
  savingsAmount: Minor
  periodStart: ISODate | null
  periodEnd: ISODate | null
  receivedOn: ISODate
  note: string | null
}

export interface ExpenseCategory {
  id: ID
  name: string
  icon: string
  isDefault: boolean
  sortOrder: number
}

export interface Expense {
  id: ID
  categoryId: ID
  categoryName: string
  categoryIcon: string
  amount: Minor
  description: string | null
  spentOn: ISODate
  createdAt: string
}

export interface SavingsGoal {
  id: ID
  name: string
  target: Minor
  targetDate: ISODate | null
  /** Derived from transactions, never stored. */
  balance: Minor
  createdAt: string
}

export type SavingsTxKind = 'deposit' | 'withdrawal'
export type SavingsTxSource = 'manual' | 'allowance' | 'initial'

export interface SavingsTransaction {
  id: ID
  goalId: ID
  kind: SavingsTxKind
  source: SavingsTxSource
  amount: Minor
  occurredOn: ISODate
  note: string | null
  createdAt: string
}
