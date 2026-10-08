import { useCallback, useState, type ReactNode } from 'react'
import { AllowanceSheet } from '@/features/budget/AllowanceSheet'
import { ExpenseSheet } from '@/features/budget/ExpenseSheet'
import { IncomeSheet } from '@/features/budget/IncomeSheet'
import { ExamSheet } from '@/features/exams/ExamSheet'
import { GoalSheet } from '@/features/savings/GoalSheet'
import { SavingsTxSheet } from '@/features/savings/SavingsTxSheet'
import { ClassSheet } from '@/features/schedule/ClassSheet'
import { SubjectSheet } from '@/features/subjects/SubjectSheet'
import { TaskSheet } from '@/features/tasks/TaskSheet'
import { QuickAddSheet } from './QuickAddSheet'
import { SheetsContext, type SheetRequest } from './SheetsContext'

/** Hosts the one form sheet that can be open at a time. */
export function SheetsProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<{ req: SheetRequest; key: number } | null>(null)
  const open = useCallback((req: SheetRequest) => setCurrent((c) => ({ req, key: (c?.key ?? 0) + 1 })), [])
  const close = useCallback(() => setCurrent(null), [])

  return (
    <SheetsContext.Provider value={open}>
      {children}
      {current && <SheetSwitch key={current.key} req={current.req} onClose={close} />}
    </SheetsContext.Provider>
  )
}

function SheetSwitch({ req, onClose }: { req: SheetRequest; onClose: () => void }) {
  switch (req.type) {
    case 'quickAdd':
      return <QuickAddSheet onClose={onClose} />
    case 'task':
      return <TaskSheet task={req.task} subjectId={req.subjectId} dueDate={req.dueDate} onClose={onClose} />
    case 'expense':
      return <ExpenseSheet expense={req.expense} onClose={onClose} />
    case 'class':
      return <ClassSheet slot={req.slot} subjectId={req.subjectId} day={req.day} onClose={onClose} />
    case 'exam':
      return <ExamSheet exam={req.exam} subjectId={req.subjectId} onClose={onClose} />
    case 'subject':
      return <SubjectSheet subject={req.subject} onClose={onClose} />
    case 'allowance':
      return <AllowanceSheet onClose={onClose} />
    case 'income':
      return <IncomeSheet income={req.income} onClose={onClose} />
    case 'goal':
      return <GoalSheet goal={req.goal} onClose={onClose} />
    case 'savingsTx':
      return <SavingsTxSheet goal={req.goal} kind={req.kind} onClose={onClose} />
  }
}
