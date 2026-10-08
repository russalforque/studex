import type { SqlDatabase } from '@/db/types'
import type { Exam, StudyStatus } from '@/types/models'
import { nowISO } from '@/utils/id'
import { examSchema, type ExamInput } from '@/validation/schemas'
import { NotFoundError, friendlyDbError } from './errors'

interface ExamRow {
  id: string
  subject_id: string | null
  subject_name: string | null
  subject_color: string | null
  title: string
  kind: Exam['kind']
  exam_date: string
  exam_time: string | null
  coverage: string | null
  notes: string | null
  study_status: StudyStatus
}

const toExam = (r: ExamRow): Exam => ({
  id: r.id,
  subjectId: r.subject_id,
  subjectName: r.subject_name,
  subjectColor: r.subject_color,
  title: r.title,
  kind: r.kind,
  date: r.exam_date,
  time: r.exam_time,
  coverage: r.coverage,
  notes: r.notes,
  studyStatus: r.study_status,
})

const SELECT = `
  SELECT e.*, s.name AS subject_name, s.color AS subject_color
  FROM exams e LEFT JOIN subjects s ON s.id = e.subject_id`

export function createExamRepository(db: SqlDatabase) {
  return {
    async list(): Promise<Exam[]> {
      const rows = await db.query<ExamRow>(`${SELECT} ORDER BY e.exam_date, e.exam_time`)
      return rows.map(toExam)
    },

    async listForSubject(subjectId: string): Promise<Exam[]> {
      const rows = await db.query<ExamRow>(`${SELECT} WHERE e.subject_id = ? ORDER BY e.exam_date, e.exam_time`, [
        subjectId,
      ])
      return rows.map(toExam)
    },

    /** Same idempotent-create contract as tasks. */
    async create(id: string, input: ExamInput): Promise<void> {
      const d = examSchema.parse(input)
      const now = nowISO()
      try {
        await db.run(
          `INSERT INTO exams (id, subject_id, title, kind, exam_date, exam_time, coverage, notes, study_status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, d.subjectId, d.title, d.kind, d.date, d.time, d.coverage, d.notes, d.studyStatus, now, now],
        )
      } catch (err) {
        if (/UNIQUE constraint failed: exams.id/i.test(String(err))) return
        throw friendlyDbError(err)
      }
    },

    async update(id: string, input: ExamInput): Promise<void> {
      const d = examSchema.parse(input)
      const res = await db.run(
        `UPDATE exams SET subject_id = ?, title = ?, kind = ?, exam_date = ?, exam_time = ?, coverage = ?, notes = ?,
           study_status = ?, updated_at = ? WHERE id = ?`,
        [d.subjectId, d.title, d.kind, d.date, d.time, d.coverage, d.notes, d.studyStatus, nowISO(), id],
      )
      if (res.changes === 0) throw new NotFoundError('Exam')
    },

    async setStudyStatus(id: string, status: StudyStatus): Promise<void> {
      await db.run('UPDATE exams SET study_status = ?, updated_at = ? WHERE id = ?', [status, nowISO(), id])
    },

    async remove(id: string): Promise<void> {
      await db.run('DELETE FROM exams WHERE id = ?', [id])
    },
  }
}

export type ExamRepository = ReturnType<typeof createExamRepository>
