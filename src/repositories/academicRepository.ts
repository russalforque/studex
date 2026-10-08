import type { SqlDatabase } from '@/db/types'
import { formatPercent as formatWeight } from '@/domain/grades'
import type { AttendanceRecord, GradeCategory, GradeItem } from '@/types/models'
import type { ISODate } from '@/utils/dates'
import { nowISO, uuid } from '@/utils/id'
import {
  attendanceSchema,
  gradeCategorySchema,
  gradeItemSchema,
  type AttendanceInput,
  type GradeCategoryInput,
  type GradeItemInput,
} from '@/validation/schemas'
import { AppError, NotFoundError, friendlyDbError } from './errors'

interface AttendanceRow {
  id: string
  subject_id: string
  date: string
  start_time: string
  status: AttendanceRecord['status']
}

interface GradeRow {
  id: string
  subject_id: string
  category_id: string | null
  title: string
  score: number | null
  max_score: number
  weight: number
  graded_on: string | null
}

interface CategoryRow {
  id: string
  subject_id: string
  name: string
  weight: number
}

const toCategory = (r: CategoryRow): GradeCategory => ({ id: r.id, subjectId: r.subject_id, name: r.name, weight: r.weight })

const MAX_CATEGORY_TOTAL = 100

const toAttendance = (r: AttendanceRow): AttendanceRecord => ({
  id: r.id,
  subjectId: r.subject_id,
  date: r.date,
  startTime: r.start_time,
  status: r.status,
})

const toGrade = (r: GradeRow): GradeItem => ({
  id: r.id,
  subjectId: r.subject_id,
  categoryId: r.category_id,
  title: r.title,
  score: r.score,
  maxScore: r.max_score,
  weight: r.weight,
  gradedOn: r.graded_on,
})

/** Attendance and grade records. Both belong to a subject and so to its term. */
export function createAcademicRepository(db: SqlDatabase) {
  return {
    // ---- Attendance ----

    /** Records how a class went. Marking the same class again changes the answer instead of adding a row. */
    async markAttendance(input: AttendanceInput): Promise<void> {
      const d = attendanceSchema.parse(input)
      await db.transaction(async (tx) => {
        const now = nowISO()
        const existing = await tx.query<{ id: string }>(
          'SELECT id FROM attendance WHERE subject_id = ? AND date = ? AND start_time = ?',
          [d.subjectId, d.date, d.startTime],
        )
        if (existing[0]) {
          await tx.run('UPDATE attendance SET status = ?, updated_at = ? WHERE id = ?', [d.status, now, existing[0].id])
        } else {
          await tx.run(
            `INSERT INTO attendance (id, subject_id, date, start_time, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [uuid(), d.subjectId, d.date, d.startTime, d.status, now, now],
          )
        }
      })
    },

    async removeAttendance(id: string): Promise<void> {
      await db.run('DELETE FROM attendance WHERE id = ?', [id])
    },

    async attendanceForSubject(subjectId: string): Promise<AttendanceRecord[]> {
      const rows = await db.query<AttendanceRow>(
        'SELECT * FROM attendance WHERE subject_id = ? ORDER BY date DESC, start_time DESC',
        [subjectId],
      )
      return rows.map(toAttendance)
    },

    async attendanceOn(date: ISODate): Promise<AttendanceRecord[]> {
      const rows = await db.query<AttendanceRow>('SELECT * FROM attendance WHERE date = ?', [date])
      return rows.map(toAttendance)
    },

    async attendanceForSemester(semesterId: string): Promise<AttendanceRecord[]> {
      const rows = await db.query<AttendanceRow>(
        `SELECT a.* FROM attendance a JOIN subjects s ON s.id = a.subject_id
         WHERE s.semester_id = ? ORDER BY a.date DESC, a.start_time DESC`,
        [semesterId],
      )
      return rows.map(toAttendance)
    },

    // ---- Grades ----

    async gradesForSubject(subjectId: string): Promise<GradeItem[]> {
      const rows = await db.query<GradeRow>(
        'SELECT * FROM grade_items WHERE subject_id = ? ORDER BY COALESCE(graded_on, created_at) DESC, created_at DESC',
        [subjectId],
      )
      return rows.map(toGrade)
    },

    async gradesForSemester(semesterId: string): Promise<GradeItem[]> {
      const rows = await db.query<GradeRow>(
        `SELECT g.* FROM grade_items g JOIN subjects s ON s.id = g.subject_id WHERE s.semester_id = ?`,
        [semesterId],
      )
      return rows.map(toGrade)
    },

    async addGrade(subjectId: string, input: GradeItemInput): Promise<void> {
      const d = gradeItemSchema.parse(input)
      const now = nowISO()
      try {
        await db.run(
          `INSERT INTO grade_items (id, subject_id, category_id, title, score, max_score, weight, graded_on, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [uuid(), subjectId, d.categoryId, d.title, d.score, d.maxScore, d.weight, d.gradedOn, now, now],
        )
      } catch (err) {
        throw friendlyDbError(err)
      }
    },

    async updateGrade(id: string, input: GradeItemInput): Promise<void> {
      const d = gradeItemSchema.parse(input)
      const res = await db.run(
        'UPDATE grade_items SET category_id = ?, title = ?, score = ?, max_score = ?, weight = ?, graded_on = ?, updated_at = ? WHERE id = ?',
        [d.categoryId, d.title, d.score, d.maxScore, d.weight, d.gradedOn, nowISO(), id],
      )
      if (res.changes === 0) throw new NotFoundError('Grade')
    },

    async removeGrade(id: string): Promise<void> {
      await db.run('DELETE FROM grade_items WHERE id = ?', [id])
    },

    // ---- Grade categories ----

    async categoriesForSubject(subjectId: string): Promise<GradeCategory[]> {
      const rows = await db.query<CategoryRow>(
        'SELECT * FROM grade_categories WHERE subject_id = ? ORDER BY sort_order, created_at',
        [subjectId],
      )
      return rows.map(toCategory)
    },

    async categoriesForSemester(semesterId: string): Promise<GradeCategory[]> {
      const rows = await db.query<CategoryRow>(
        `SELECT c.* FROM grade_categories c JOIN subjects s ON s.id = c.subject_id WHERE s.semester_id = ? ORDER BY c.sort_order`,
        [semesterId],
      )
      return rows.map(toCategory)
    },

    /** Categories of one subject can't add up to more than 100%. */
    async saveCategory(subjectId: string, id: string | null, input: GradeCategoryInput): Promise<void> {
      const d = gradeCategorySchema.parse(input)
      await db.transaction(async (tx) => {
        const rows = await tx.query<{ total: number | null }>(
          'SELECT SUM(weight) AS total FROM grade_categories WHERE subject_id = ? AND id <> ?',
          [subjectId, id ?? ''],
        )
        const others = rows[0]?.total ?? 0
        if (others + d.weight > MAX_CATEGORY_TOTAL + 1e-9) {
          throw new AppError(`Categories can add up to 100%. ${formatWeight(MAX_CATEGORY_TOTAL - others)} is left.`)
        }
        const now = nowISO()
        try {
          if (id) {
            await tx.run('UPDATE grade_categories SET name = ?, weight = ?, updated_at = ? WHERE id = ?', [d.name, d.weight, now, id])
          } else {
            await tx.run(
              `INSERT INTO grade_categories (id, subject_id, name, weight, sort_order, created_at, updated_at)
               VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 10 FROM grade_categories WHERE subject_id = ?), ?, ?)`,
              [uuid(), subjectId, d.name, d.weight, subjectId, now, now],
            )
          }
        } catch (err) {
          throw friendlyDbError(err, 'This subject already has a category with that name.')
        }
      })
    },

    /** Its items stay, uncategorised. */
    async removeCategory(id: string): Promise<void> {
      await db.transaction(async (tx) => {
        await tx.run('UPDATE grade_items SET category_id = NULL, updated_at = ? WHERE category_id = ?', [nowISO(), id])
        await tx.run('DELETE FROM grade_categories WHERE id = ?', [id])
      })
    },
  }
}

export type AcademicRepository = ReturnType<typeof createAcademicRepository>
