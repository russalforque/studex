import { z } from 'zod'
import {
  EXAM_KINDS,
  FREQUENCIES,
  STUDY_STATUSES,
  TASK_KINDS,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from '@/types/models'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date')
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Choose a time')
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep it under ${max} characters`)
    .transform((v) => (v === '' ? null : v))
    .nullable()
const requiredText = (label: string, max: number) =>
  z.string().trim().min(1, `${label} is required`).max(max, `Keep it under ${max} characters`)
const money = (label: string) =>
  z
    .number({ error: `Enter ${label}` })
    .int()
    .positive(`${label[0]!.toUpperCase()}${label.slice(1)} must be more than zero`)
    .max(1_000_000_000_00, 'That amount is too large')

export const settingsSchema = z.object({
  studentName: requiredText('Your name', 60),
  schoolName: optionalText(100),
  currency: z.string().length(3),
})

export const semesterSchema = z.object({
  name: requiredText('Term name', 60),
  academicYear: optionalText(30),
})

export const subjectSchema = z.object({
  name: requiredText('Subject name', 80),
  code: optionalText(30),
  instructor: optionalText(80),
  room: optionalText(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  notes: optionalText(2000),
})

export const classSlotSchema = z
  .object({
    subjectId: z.string().min(1, 'Choose a subject'),
    days: z.array(z.number().int().min(0).max(6)).min(1, 'Pick at least one day'),
    startTime: time,
    endTime: time,
    room: optionalText(40),
  })
  .refine((v) => v.endTime > v.startTime, { path: ['endTime'], message: 'Ends before it starts' })

export const taskSchema = z.object({
  title: requiredText('Title', 120),
  subjectId: z.string().nullable(),
  description: optionalText(2000),
  kind: z.enum(TASK_KINDS),
  dueDate: isoDate.nullable(),
  dueTime: time.nullable(),
  priority: z.enum(TASK_PRIORITIES),
  status: z.enum(TASK_STATUSES),
})

export const examSchema = z.object({
  title: requiredText('Title', 120),
  subjectId: z.string().nullable(),
  kind: z.enum(EXAM_KINDS),
  date: isoDate,
  time: time.nullable(),
  coverage: optionalText(1000),
  notes: optionalText(2000),
  studyStatus: z.enum(STUDY_STATUSES),
})

export const expenseSchema = z.object({
  amount: money('an amount'),
  categoryId: z.string().min(1, 'Choose a category'),
  description: optionalText(120),
  spentOn: isoDate,
})

export const categorySchema = z.object({
  name: requiredText('Name', 40),
  icon: z.string().min(1),
})

export const allowancePlanSchema = z
  .object({
    amount: money('your allowance'),
    frequency: z.enum(FREQUENCIES),
    intervalDays: z.number().int().min(1).max(366).nullable(),
    anchorDate: isoDate,
    savingsAmount: z.number().int().min(0),
    savingsGoalId: z.string().nullable(),
  })
  .refine((v) => v.frequency !== 'custom' || v.intervalDays !== null, {
    path: ['intervalDays'],
    message: 'How many days between allowances?',
  })
  .refine((v) => v.savingsAmount <= v.amount, {
    path: ['savingsAmount'],
    message: "Can't save more than the allowance",
  })

export const extraIncomeSchema = z.object({
  amount: money('an amount'),
  receivedOn: isoDate,
  note: optionalText(120),
})

export const savingsGoalSchema = z.object({
  name: requiredText('Goal name', 60),
  target: money('a target'),
  targetDate: isoDate.nullable(),
})

export const savingsTxSchema = z.object({
  amount: money('an amount'),
  occurredOn: isoDate,
  note: optionalText(120),
})

export type SettingsInput = z.input<typeof settingsSchema>
export type SemesterInput = z.input<typeof semesterSchema>
export type SubjectInput = z.input<typeof subjectSchema>
export type ClassSlotInput = z.input<typeof classSlotSchema>
export type TaskInput = z.input<typeof taskSchema>
export type ExamInput = z.input<typeof examSchema>
export type ExpenseInput = z.input<typeof expenseSchema>
export type CategoryInput = z.input<typeof categorySchema>
export type AllowancePlanInput = z.input<typeof allowancePlanSchema>
export type ExtraIncomeInput = z.input<typeof extraIncomeSchema>
export type SavingsGoalInput = z.input<typeof savingsGoalSchema>
export type SavingsTxInput = z.input<typeof savingsTxSchema>

export type FieldErrors = Record<string, string>

/** Validate for a form: either parsed data or the first message per field. */
export function validate<S extends z.ZodType>(
  schema: S,
  values: unknown,
): { ok: true; data: z.output<S> } | { ok: false; errors: FieldErrors } {
  const res = schema.safeParse(values)
  if (res.success) return { ok: true, data: res.data }
  const errors: FieldErrors = {}
  for (const issue of res.error.issues) {
    const key = issue.path.join('.') || '_form'
    if (!errors[key]) errors[key] = issue.message
  }
  return { ok: false, errors }
}
