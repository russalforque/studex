import type { SqlDatabase } from '@/db/types'
import { createAcademicRepository } from './academicRepository'
import { createAllowanceRepository } from './allowanceRepository'
import { createBackupRepository } from './backupRepository'
import { createExamRepository } from './examRepository'
import { createExpenseRepository } from './expenseRepository'
import { createFileRepository } from './fileRepository'
import { createFocusRepository } from './focusRepository'
import { createGuideRepository } from './guideRepository'
import { createInsightRepository } from './insightRepository'
import { createNoteRepository } from './noteRepository'
import { createPlannedRepository } from './plannedRepository'
import { createRecurringRepository } from './recurringRepository'
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
    notes: createNoteRepository(db),
    academics: createAcademicRepository(db),
    insights: createInsightRepository(db),
    backup: createBackupRepository(db),
    files: createFileRepository(db),
    guides: createGuideRepository(db),
    focus: createFocusRepository(db),
    recurring: createRecurringRepository(db),
    planned: createPlannedRepository(db),
  }
}

export type Repositories = ReturnType<typeof createRepositories>
