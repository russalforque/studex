import { createContext, useContext } from 'react'
import type {
  ClassSlotView,
  Exam,
  Expense,
  Income,
  SavingsGoal,
  SavingsTxKind,
  Subject,
  Task,
} from '@/types/models'

/** Every bottom-sheet form in the app, openable from any screen. */
export type SheetRequest =
  | { type: 'quickAdd' }
  | { type: 'task'; task?: Task; subjectId?: string; dueDate?: string }
  | { type: 'expense'; expense?: Expense }
  | { type: 'class'; slot?: ClassSlotView; subjectId?: string; day?: number }
  | { type: 'exam'; exam?: Exam; subjectId?: string }
  | { type: 'subject'; subject?: Subject }
  | { type: 'allowance' }
  | { type: 'income'; income?: Income }
  | { type: 'goal'; goal?: SavingsGoal }
  | { type: 'savingsTx'; goal: SavingsGoal; kind: SavingsTxKind }

export const SheetsContext = createContext<(req: SheetRequest) => void>(() => undefined)

export function useSheets() {
  return useContext(SheetsContext)
}
