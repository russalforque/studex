import { createContext, useContext } from 'react'
import type {
  AttendanceRecord,
  ClassSlotView,
  Exam,
  Expense,
  ExpensePreset,
  GradeItem,
  Income,
  Note,
  PlannedExpense,
  RecurringExpense,
  SavingsGoal,
  SavingsTxKind,
  Subject,
  Task,
} from '@/types/models'

/** Every bottom-sheet form in the app, openable from any screen. */
export type SheetRequest =
  | { type: 'quickAdd' }
  | { type: 'task'; task?: Task; subjectId?: string; dueDate?: string }
  | { type: 'expense'; expense?: Expense; preset?: ExpensePreset }
  | { type: 'planned'; planned?: PlannedExpense; subjectId?: string; taskId?: string; title?: string }
  | { type: 'recurring'; recurring?: RecurringExpense }
  | { type: 'presets' }
  | { type: 'gradeCategories'; subjectId: string }
  | { type: 'class'; slot?: ClassSlotView; subjectId?: string; day?: number }
  | { type: 'exam'; exam?: Exam; subjectId?: string }
  | { type: 'subject'; subject?: Subject }
  | { type: 'allowance' }
  | { type: 'income'; income?: Income }
  | { type: 'goal'; goal?: SavingsGoal }
  | { type: 'savingsTx'; goal: SavingsGoal; kind: SavingsTxKind }
  | { type: 'note'; note?: Note; subjectId?: string }
  | { type: 'grade'; subjectId: string; grade?: GradeItem }
  | { type: 'attendance'; subjectId: string; record?: AttendanceRecord }
  | { type: 'safeToSpend' }
  | { type: 'addFile'; subjectId?: string }

export const SheetsContext = createContext<(req: SheetRequest) => void>(() => undefined)

export function useSheets() {
  return useContext(SheetsContext)
}
