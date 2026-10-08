import type { SqlDatabase, SqlExecutor } from '@/db/types'
import type { Semester, Settings } from '@/types/models'
import { nowISO, uuid } from '@/utils/id'
import { semesterSchema, settingsSchema, type SemesterInput, type SettingsInput } from '@/validation/schemas'

interface SettingsRow {
  student_name: string
  school_name: string | null
  currency: string
  spending_days: string
  current_semester_id: string | null
  onboarded_at: string | null
}

interface SemesterRow {
  id: string
  name: string
  academic_year: string | null
  created_at: string
}

const toSettings = (r: SettingsRow): Settings => ({
  studentName: r.student_name,
  schoolName: r.school_name,
  currency: r.currency,
  spendingDays: r.spending_days.split('').map(Number),
  currentSemesterId: r.current_semester_id,
  onboardedAt: r.onboarded_at,
})

const toSemester = (r: SemesterRow): Semester => ({
  id: r.id,
  name: r.name,
  academicYear: r.academic_year,
  createdAt: r.created_at,
})

export function encodeSpendingDays(days: number[]): string {
  return [...new Set(days)]
    .filter((d) => d >= 0 && d <= 6)
    .sort()
    .join('')
}

async function insertSemester(tx: SqlExecutor, input: SemesterInput): Promise<string> {
  const data = semesterSchema.parse(input)
  const id = uuid()
  const now = nowISO()
  await tx.run('INSERT INTO semesters (id, name, academic_year, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [
    id,
    data.name,
    data.academicYear,
    now,
    now,
  ])
  return id
}

export function createSettingsRepository(db: SqlDatabase) {
  return {
    async get(): Promise<Settings | null> {
      const rows = await db.query<SettingsRow>('SELECT * FROM settings WHERE id = 1')
      return rows[0] ? toSettings(rows[0]) : null
    },

    /** First-launch setup. Creates the settings row and the first term together. */
    async completeOnboarding(
      tx: SqlExecutor,
      profile: SettingsInput,
      term: SemesterInput,
    ): Promise<{ semesterId: string }> {
      const p = settingsSchema.parse(profile)
      const existing = await tx.query('SELECT 1 FROM settings WHERE id = 1')
      if (existing.length > 0) throw new Error('Studex is already set up on this device.')
      const semesterId = await insertSemester(tx, term)
      const now = nowISO()
      await tx.run(
        `INSERT INTO settings (id, student_name, school_name, currency, current_semester_id, onboarded_at, created_at, updated_at)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?)`,
        [p.studentName, p.schoolName, p.currency, semesterId, now, now, now],
      )
      return { semesterId }
    },

    async updateProfile(input: SettingsInput): Promise<void> {
      const p = settingsSchema.parse(input)
      await db.run(
        'UPDATE settings SET student_name = ?, school_name = ?, currency = ?, updated_at = ? WHERE id = 1',
        [p.studentName, p.schoolName, p.currency, nowISO()],
      )
    },

    async setSpendingDays(days: number[]): Promise<void> {
      const encoded = encodeSpendingDays(days)
      if (!encoded) throw new Error('Pick at least one day')
      await db.run('UPDATE settings SET spending_days = ?, updated_at = ? WHERE id = 1', [encoded, nowISO()])
    },

    async currentSemester(): Promise<Semester | null> {
      const rows = await db.query<SemesterRow>(
        'SELECT s.* FROM semesters s JOIN settings ON settings.current_semester_id = s.id WHERE settings.id = 1',
      )
      return rows[0] ? toSemester(rows[0]) : null
    },

    async listSemesters(): Promise<Semester[]> {
      const rows = await db.query<SemesterRow>('SELECT * FROM semesters ORDER BY created_at DESC')
      return rows.map(toSemester)
    },

    async updateSemester(id: string, input: SemesterInput): Promise<void> {
      const data = semesterSchema.parse(input)
      await db.run('UPDATE semesters SET name = ?, academic_year = ?, updated_at = ? WHERE id = ?', [
        data.name,
        data.academicYear,
        nowISO(),
        id,
      ])
    },

    /** Starts a new term. Earlier terms and their subjects are kept, just no longer current. */
    async startSemester(input: SemesterInput): Promise<string> {
      return db.transaction(async (tx) => {
        const id = await insertSemester(tx, input)
        await tx.run('UPDATE settings SET current_semester_id = ?, updated_at = ? WHERE id = 1', [id, nowISO()])
        return id
      })
    },

    async switchSemester(id: string): Promise<void> {
      await db.run('UPDATE settings SET current_semester_id = ?, updated_at = ? WHERE id = 1', [id, nowISO()])
    },
  }
}

export type SettingsRepository = ReturnType<typeof createSettingsRepository>
