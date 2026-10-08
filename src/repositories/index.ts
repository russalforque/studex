import type { SqlDatabase } from '@/db/types'
import { createAllowanceRepository } from './allowanceRepository'
import { createExamRepository } from './examRepository'
import { createExpenseRepository } from './expenseRepository'
import { createSavingsRepository } from './savingsRepository'
import { createSettingsRepository } from './settingsRepository'
import { createSubjectRepository } from './subjectRepository'
import { createTaskRepository } from './taskRepository'

export function createRepositories(db: SqlDatabase) {
  return {
    db,
    settings: createSettingsRepository(db),
    subjects: createSubjectRepository(db),
    tasks: createTaskRepository(db),
    exams: createExamRepository(db),
    expenses: createExpenseRepository(db),
    allowance: createAllowanceRepository(db),
    savings: createSavingsRepository(db),
  }
}

export type Repositories = ReturnType<typeof createRepositories>
