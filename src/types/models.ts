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
  course: string | null
  yearLevel: string | null
  /** Small JPEG data URL, or null for the initials avatar. */
  avatar: string | null
  reminders: ReminderPrefs
  attendanceRules: AttendanceRules
}

/** How early to remind. `DAY_BEFORE` is the evening before (7 PM), as one message for everything due. */
export const DAY_BEFORE = 1440
export const LEAD_OPTIONS = [0, 15, 30, 60, DAY_BEFORE] as const

export interface ReminderPrefs {
  enabled: boolean
  tasks: boolean
  /** Minutes before a task's due time; untimed tasks get a morning reminder on the day. */
  taskLeadMinutes: number
  exams: boolean
  examLeadMinutes: number
  /** Shortly before each class starts. */
  classes: boolean
  classLeadMinutes: number
  /** Unpaid planned expenses, the morning they are due. */
  planned: boolean
  /** An evening nudge to log the day's spending. */
  budget: boolean
  /** When a focus session or break ends. */
  focus: boolean
}

export const DEFAULT_REMINDERS: ReminderPrefs = {
  enabled: false,
  tasks: true,
  taskLeadMinutes: DAY_BEFORE,
  exams: true,
  examLeadMinutes: DAY_BEFORE,
  classes: false,
  classLeadMinutes: 15,
  planned: true,
  budget: false,
  focus: true,
}

/**
 * Schools count attendance differently. `late`: whether a late arrival counts as attended,
 * half, or absent. `excused`: left out of the rate, or counted as attended.
 */
export interface AttendanceRules {
  late: 'present' | 'half' | 'absent'
  excused: 'skip' | 'present'
}

export const DEFAULT_ATTENDANCE_RULES: AttendanceRules = { late: 'present', excused: 'skip' }

export interface Semester {
  id: ID
  name: string
  academicYear: string | null
  createdAt: string
  archivedAt: string | null
}

export interface SemesterSummary extends Semester {
  subjectCount: number
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
  /** Percentage the student is aiming for. */
  targetGrade: number | null
  /** Attendance percentage the school requires, if any. */
  attendanceRequired: number | null
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
  topicsTotal: number
  topicsDone: number
}

export interface ExamTopic {
  id: ID
  examId: ID
  title: string
  done: boolean
}

export interface Note {
  id: ID
  subjectId: ID | null
  subjectName: string | null
  subjectColor: string | null
  title: string | null
  body: string
  pinned: boolean
  updatedAt: string
}

export const ATTENDANCE_STATUSES = ['present', 'late', 'absent', 'excused'] as const
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number]

export interface AttendanceRecord {
  id: ID
  subjectId: ID
  date: ISODate
  /** '' when not tied to a class time. */
  startTime: string
  status: AttendanceStatus
}

export const FILE_KINDS = ['image', 'pdf', 'doc', 'text'] as const
export type FileKind = (typeof FILE_KINDS)[number]
export type LinkTargetType = 'task' | 'exam' | 'note'

/** A study material stored on the device. `path` is relative to the app's private data folder. */
export interface StudyFile {
  id: ID
  name: string
  originalName: string | null
  mimeType: string
  kind: FileKind
  sizeBytes: number
  path: string
  thumbPath: string | null
  subjectId: ID | null
  subjectName: string | null
  subjectColor: string | null
  description: string | null
  /** How many tasks, exams and notes it is attached to. */
  linkCount: number
  createdAt: string
  updatedAt: string
}

export interface FileLink {
  fileId: ID
  targetType: LinkTargetType
  targetId: ID
  /** Title of the task, exam or note, for display. */
  targetTitle: string
}

export interface GradeItem {
  id: ID
  subjectId: ID
  categoryId: ID | null
  title: string
  /** Null while the work hasn't been graded yet. */
  score: number | null
  maxScore: number
  weight: number
  gradedOn: ISODate | null
}

/** A share of the final grade, e.g. Quizzes 30%. */
export interface GradeCategory {
  id: ID
  subjectId: ID
  name: string
  /** Percentage of the final grade. */
  weight: number
}

export type SessionStatus = 'completed' | 'interrupted'

export interface StudySession {
  id: ID
  subjectId: ID | null
  subjectName: string | null
  subjectColor: string | null
  plannedSeconds: number
  focusedSeconds: number
  startedAt: string
  endedAt: string
  status: SessionStatus
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

export type RecurringMode = 'auto' | 'confirm'

/** A repeating expense: recorded on each due date automatically, or after the student confirms. */
export interface RecurringExpense {
  id: ID
  name: string
  amount: Minor
  categoryId: ID
  categoryName: string
  categoryIcon: string
  frequency: Frequency
  intervalDays: number | null
  startDate: ISODate
  endDate: ISODate | null
  mode: RecurringMode
  active: boolean
}

/** A due date of a recurring expense that is waiting for the student to confirm or skip. */
export interface PendingOccurrence {
  recurring: RecurringExpense
  date: ISODate
}

/** A school expense coming up, before the money is spent. */
export interface PlannedExpense {
  id: ID
  title: string
  amount: Minor
  categoryId: ID
  categoryName: string
  categoryIcon: string
  dueDate: ISODate | null
  subjectId: ID | null
  subjectName: string | null
  subjectColor: string | null
  taskId: ID | null
  taskTitle: string | null
  /** Hold the money back from Safe to spend until it's paid. */
  reserve: boolean
  note: string | null
  /** The real expense once paid. */
  expenseId: ID | null
  paidOn: ISODate | null
  paidAmount: Minor | null
}

/** A saved one-tap expense, e.g. "Jeepney fare ₱15". */
export interface ExpensePreset {
  id: ID
  name: string
  amount: Minor
  categoryId: ID
  categoryName: string
  categoryIcon: string
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

/** Walkthrough and feature-tip progress. `started` means the tour was opened but not finished. */
export type GuideStatus = 'started' | 'completed' | 'skipped' | 'seen'

export interface GuideProgress {
  id: string
  version: number
  status: GuideStatus
  step: number
  updatedAt: string
}
