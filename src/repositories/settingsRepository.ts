import type { SqlDatabase, SqlExecutor } from '@/db/types'
import { parseAttendanceRules } from '@/domain/attendance'
import {
  DEFAULT_REMINDERS,
  LEAD_OPTIONS,
  type AttendanceRules,
  type ReminderPrefs,
  type Semester,
  type SemesterSummary,
  type Settings,
} from '@/types/models'
import { nowISO, uuid } from '@/utils/id'
import {
  profileSchema,
  semesterSchema,
  settingsSchema,
  type ProfileInput,
  type SemesterInput,
  type SettingsInput,
} from '@/validation/schemas'
import { AppError } from './errors'

interface SettingsRow {
  student_name: string
  school_name: string | null
  currency: string
  spending_days: string
  current_semester_id: string | null
  onboarded_at: string | null
  course: string | null
  year_level: string | null
  avatar: string | null
  reminder_prefs: string | null
  attendance_rules: string | null
}

interface SemesterRow {
  id: string
  name: string
  academic_year: string | null
  created_at: string
  archived_at: string | null
}

const toSettings = (r: SettingsRow): Settings => ({
  studentName: r.student_name,
  schoolName: r.school_name,
  currency: r.currency,
  spendingDays: r.spending_days.split('').map(Number),
  currentSemesterId: r.current_semester_id,
  onboardedAt: r.onboarded_at,
  course: r.course,
  yearLevel: r.year_level,
  avatar: r.avatar,
  reminders: parseReminderPrefs(r.reminder_prefs),
  attendanceRules: parseAttendanceRules(r.attendance_rules),
})

/** Reads saved preferences; anything missing (older versions) or invalid takes its default. */
export function parseReminderPrefs(json: string | null): ReminderPrefs {
  if (!json) return { ...DEFAULT_REMINDERS }
  try {
    const v = JSON.parse(json) as Partial<ReminderPrefs>
    const bool = (k: keyof ReminderPrefs) => (typeof v[k] === 'boolean' ? (v[k] as boolean) : (DEFAULT_REMINDERS[k] as boolean))
    const lead = (k: 'taskLeadMinutes' | 'examLeadMinutes') =>
      (LEAD_OPTIONS as readonly number[]).includes(Number(v[k])) ? Number(v[k]) : DEFAULT_REMINDERS[k]
    return {
      enabled: bool('enabled'),
      tasks: bool('tasks'),
      taskLeadMinutes: lead('taskLeadMinutes'),
      exams: bool('exams'),
      examLeadMinutes: lead('examLeadMinutes'),
      classes: bool('classes'),
      classLeadMinutes: [5, 10, 15, 30, 60].includes(Number(v.classLeadMinutes))
        ? Number(v.classLeadMinutes)
        : DEFAULT_REMINDERS.classLeadMinutes,
      planned: bool('planned'),
      budget: bool('budget'),
      focus: bool('focus'),
    }
  } catch {
    return { ...DEFAULT_REMINDERS }
  }
}

/** Data URLs above this size are refused; the picker resizes photos to ~20–40 KB. */
const MAX_AVATAR_CHARS = 400_000

const toSemester = (r: SemesterRow): Semester => ({
  id: r.id,
  name: r.name,
  academicYear: r.academic_year,
  createdAt: r.created_at,
  archivedAt: r.archived_at,
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

    async updateProfile(input: ProfileInput): Promise<void> {
      const p = profileSchema.parse(input)
      await db.run(
        'UPDATE settings SET student_name = ?, school_name = ?, course = ?, year_level = ?, updated_at = ? WHERE id = 1',
        [p.studentName, p.schoolName, p.course, p.yearLevel, nowISO()],
      )
    },

    async setCurrency(currency: string): Promise<void> {
      if (!/^[A-Z]{3}$/.test(currency)) throw new AppError('Choose a currency.')
      await db.run('UPDATE settings SET currency = ?, updated_at = ? WHERE id = 1', [currency, nowISO()])
    },

    /** Stores a small JPEG data URL, or clears it with null. */
    async setAvatar(dataUrl: string | null): Promise<void> {
      if (dataUrl !== null && (!dataUrl.startsWith('data:image/') || dataUrl.length > MAX_AVATAR_CHARS)) {
        throw new AppError("That photo couldn't be used. Try a different one.")
      }
      await db.run('UPDATE settings SET avatar = ?, updated_at = ? WHERE id = 1', [dataUrl, nowISO()])
    },

    async setReminderPrefs(prefs: ReminderPrefs): Promise<void> {
      await db.run('UPDATE settings SET reminder_prefs = ?, updated_at = ? WHERE id = 1', [JSON.stringify(prefs), nowISO()])
    },

    async setAttendanceRules(rules: AttendanceRules): Promise<void> {
      const clean = parseAttendanceRules(JSON.stringify(rules))
      await db.run('UPDATE settings SET attendance_rules = ?, updated_at = ? WHERE id = 1', [JSON.stringify(clean), nowISO()])
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

    async listSemesters(): Promise<SemesterSummary[]> {
      const rows = await db.query<SemesterRow & { subject_count: number }>(
        `SELECT s.*, (SELECT COUNT(*) FROM subjects WHERE semester_id = s.id AND archived_at IS NULL) AS subject_count
         FROM semesters s ORDER BY s.created_at DESC`,
      )
      return rows.map((r) => ({ ...toSemester(r), subjectCount: r.subject_count }))
    },

    async getSemester(id: string): Promise<Semester | null> {
      const rows = await db.query<SemesterRow>('SELECT * FROM semesters WHERE id = ?', [id])
      return rows[0] ? toSemester(rows[0]) : null
    },

    /** Archiving only tidies the list; nothing in the term is changed. The current term can't be archived. */
    async setSemesterArchived(id: string, archived: boolean): Promise<void> {
      if (archived) {
        const cur = await db.query<{ id: string }>('SELECT current_semester_id AS id FROM settings WHERE id = 1')
        if (cur[0]?.id === id) throw new AppError("The current term can't be archived. Switch to another term first.")
      }
      await db.run('UPDATE semesters SET archived_at = ?, updated_at = ? WHERE id = ?', [archived ? nowISO() : null, nowISO(), id])
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
      await db.transaction(async (tx) => {
        const now = nowISO()
        await tx.run('UPDATE semesters SET archived_at = NULL, updated_at = ? WHERE id = ?', [now, id])
        await tx.run('UPDATE settings SET current_semester_id = ?, updated_at = ? WHERE id = 1', [id, now])
      })
    },
  }
}

export type SettingsRepository = ReturnType<typeof createSettingsRepository>
