import { SCHEMA_VERSION } from '@/db/migrations'
import type { SqlDatabase, SqlValue } from '@/db/types'
import { AppError } from './errors'

/**
 * Every table with student data, parents before children so rows can be inserted
 * in this order and deleted in reverse without breaking a foreign key.
 */
export const BACKUP_TABLES = [
  'semesters',
  'settings',
  'subjects',
  'class_schedules',
  'tasks',
  'exams',
  'exam_topics',
  'notes',
  'attendance',
  'grade_categories',
  'grade_items',
  'study_sessions',
  'files',
  'file_links',
  'savings_goals',
  'allowance_plans',
  'allowances',
  'savings_transactions',
  'expense_categories',
  'expenses',
  'expense_presets',
  'recurring_expenses',
  'recurring_occurrences',
  'planned_expenses',
] as const

type TableName = (typeof BACKUP_TABLES)[number]
type Row = Record<string, SqlValue>

export const BACKUP_APP = 'studex'
const BACKUP_FORMAT = 1

export interface BackupFile {
  app: typeof BACKUP_APP
  format: number
  schemaVersion: number
  appVersion: string
  exportedAt: string
  tables: Partial<Record<TableName, Row[]>>
}

export interface BackupPreview {
  exportedAt: string
  studentName: string | null
  counts: { subjects: number; tasks: number; exams: number; notes: number; expenses: number; goals: number }
}

const DAMAGED = "This file isn't a Studex backup, or it's damaged. Nothing was changed."

function isRow(v: unknown): v is Row {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false
  return Object.values(v).every((x) => x === null || typeof x === 'string' || typeof x === 'number')
}

/** Checks a file's shape before anything is touched. Throws a message the student can act on. */
export function parseBackup(text: string): BackupFile {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new AppError(DAMAGED)
  }
  const b = data as Partial<BackupFile>
  if (!b || b.app !== BACKUP_APP || typeof b.schemaVersion !== 'number' || !b.tables || typeof b.tables !== 'object') {
    throw new AppError(DAMAGED)
  }
  if (b.format !== BACKUP_FORMAT) throw new AppError(DAMAGED)
  if (b.schemaVersion > SCHEMA_VERSION) {
    throw new AppError('This backup was made by a newer version of Studex. Update the app, then restore it.')
  }
  for (const [name, rows] of Object.entries(b.tables)) {
    if (!(BACKUP_TABLES as readonly string[]).includes(name)) throw new AppError(DAMAGED)
    if (!Array.isArray(rows) || !rows.every(isRow)) throw new AppError(DAMAGED)
  }
  const settings = b.tables.settings ?? []
  if (settings.length !== 1 || settings[0]?.id !== 1) throw new AppError(DAMAGED)
  return b as BackupFile
}

export function previewBackup(b: BackupFile): BackupPreview {
  const n = (t: TableName) => b.tables[t]?.length ?? 0
  const name = b.tables.settings?.[0]?.student_name
  return {
    exportedAt: b.exportedAt,
    studentName: typeof name === 'string' ? name : null,
    counts: {
      subjects: n('subjects'),
      tasks: n('tasks'),
      exams: n('exams'),
      notes: n('notes'),
      expenses: n('expenses'),
      goals: n('savings_goals'),
    },
  }
}

export function createBackupRepository(db: SqlDatabase) {
  return {
    async exportAll(appVersion: string): Promise<BackupFile> {
      const tables: BackupFile['tables'] = {}
      // One transaction so the snapshot is consistent even if a write is queued meanwhile.
      await db.transaction(async (tx) => {
        for (const t of BACKUP_TABLES) tables[t] = await tx.query<Row>(`SELECT * FROM ${t}`)
      })
      return {
        app: BACKUP_APP,
        format: BACKUP_FORMAT,
        schemaVersion: SCHEMA_VERSION,
        appVersion,
        exportedAt: new Date().toISOString(),
        tables,
      }
    },

    /**
     * Replaces everything on this device with the backup, all or nothing. Columns the
     * backup doesn't have (an older version) take their defaults; unknown columns are ignored.
     */
    async restore(backup: BackupFile): Promise<void> {
      await db.transaction(async (tx) => {
        const columns = new Map<TableName, Set<string>>()
        for (const t of BACKUP_TABLES) {
          const info = await tx.query<{ name: string }>(`PRAGMA table_info(${t})`)
          columns.set(t, new Set(info.map((c) => c.name)))
        }
        for (const t of [...BACKUP_TABLES].reverse()) await tx.run(`DELETE FROM ${t}`)
        try {
          for (const t of BACKUP_TABLES) {
            const known = columns.get(t)!
            for (const row of backup.tables[t] ?? []) {
              const cols = Object.keys(row).filter((c) => known.has(c))
              if (cols.length === 0) continue
              await tx.run(
                `INSERT INTO ${t} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
                cols.map((c) => row[c] ?? null),
              )
            }
          }
        } catch (err) {
          console.error('Restore failed', err)
          throw new AppError("This backup couldn't be restored because some of its data isn't valid. Nothing was changed.")
        }
      })
    },
  }
}

export type BackupRepository = ReturnType<typeof createBackupRepository>
