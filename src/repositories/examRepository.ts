import type { SqlDatabase } from '@/db/types'
import type { Exam, ExamTopic, StudyStatus } from '@/types/models'
import { nowISO, uuid } from '@/utils/id'
import { examSchema, topicTitleSchema, type ExamInput } from '@/validation/schemas'
import { AppError, NotFoundError, friendlyDbError } from './errors'
import { unlinkTarget } from './fileRepository'

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
  topics_total: number
  topics_done: number
}

interface TopicRow {
  id: string
  exam_id: string
  title: string
  done: number
}

const toTopic = (r: TopicRow): ExamTopic => ({ id: r.id, examId: r.exam_id, title: r.title, done: r.done === 1 })

/** Topics are capped so a pasted syllabus can't turn the exam into a project plan. */
const MAX_TOPICS = 50

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
  topicsTotal: r.topics_total ?? 0,
  topicsDone: r.topics_done ?? 0,
})

const SELECT = `
  SELECT e.*, s.name AS subject_name, s.color AS subject_color,
    (SELECT COUNT(*) FROM exam_topics t WHERE t.exam_id = e.id) AS topics_total,
    (SELECT COUNT(*) FROM exam_topics t WHERE t.exam_id = e.id AND t.done = 1) AS topics_done
  FROM exams e LEFT JOIN subjects s ON s.id = e.subject_id`

export function createExamRepository(db: SqlDatabase) {
  return {
    async list(): Promise<Exam[]> {
      const rows = await db.query<ExamRow>(`${SELECT} ORDER BY e.exam_date, e.exam_time`)
      return rows.map(toExam)
    },

    async get(id: string): Promise<Exam> {
      const rows = await db.query<ExamRow>(`${SELECT} WHERE e.id = ?`, [id])
      if (!rows[0]) throw new NotFoundError('Exam')
      return toExam(rows[0])
    },

    async listForSubject(subjectId: string): Promise<Exam[]> {
      const rows = await db.query<ExamRow>(`${SELECT} WHERE e.subject_id = ? ORDER BY e.exam_date, e.exam_time`, [
        subjectId,
      ])
      return rows.map(toExam)
    },

    /** Same idempotent-create contract as tasks. Topics added before saving are stored with the exam. */
    async create(id: string, input: ExamInput, topics: string[] = []): Promise<void> {
      const d = examSchema.parse(input)
      const titles = topics.map((t) => topicTitleSchema.parse(t)).slice(0, MAX_TOPICS)
      const now = nowISO()
      try {
        await db.transaction(async (tx) => {
          await tx.run(
            `INSERT INTO exams (id, subject_id, title, kind, exam_date, exam_time, coverage, notes, study_status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, d.subjectId, d.title, d.kind, d.date, d.time, d.coverage, d.notes, d.studyStatus, now, now],
          )
          for (const [i, title] of titles.entries()) {
            await tx.run(
              'INSERT INTO exam_topics (id, exam_id, title, done, sort_order, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?, ?)',
              [uuid(), id, title, (i + 1) * 10, now, now],
            )
          }
        })
      } catch (err) {
        if (/UNIQUE constraint failed: exams.id/i.test(String(err))) return
        throw friendlyDbError(err)
      }
    },

    // ---- Study topics ----

    async listTopics(examId: string): Promise<ExamTopic[]> {
      const rows = await db.query<TopicRow>('SELECT * FROM exam_topics WHERE exam_id = ? ORDER BY sort_order, created_at', [
        examId,
      ])
      return rows.map(toTopic)
    },

    async addTopic(examId: string, title: string): Promise<void> {
      const t = topicTitleSchema.parse(title)
      await db.transaction(async (tx) => {
        const rows = await tx.query<{ n: number; next: number }>(
          'SELECT COUNT(*) AS n, COALESCE(MAX(sort_order), 0) + 10 AS next FROM exam_topics WHERE exam_id = ?',
          [examId],
        )
        if ((rows[0]?.n ?? 0) >= MAX_TOPICS) throw new AppError(`An exam can have up to ${MAX_TOPICS} topics.`)
        const now = nowISO()
        await tx.run(
          'INSERT INTO exam_topics (id, exam_id, title, done, sort_order, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?, ?)',
          [uuid(), examId, t, rows[0]?.next ?? 10, now, now],
        )
      })
    },

    /** Ticking the first topic moves a "Not started" exam to "Studying". */
    async setTopicDone(topicId: string, done: boolean): Promise<void> {
      await db.transaction(async (tx) => {
        const now = nowISO()
        await tx.run('UPDATE exam_topics SET done = ?, updated_at = ? WHERE id = ?', [done ? 1 : 0, now, topicId])
        if (done) {
          await tx.run(
            `UPDATE exams SET study_status = 'studying', updated_at = ?
             WHERE study_status = 'not_started' AND id = (SELECT exam_id FROM exam_topics WHERE id = ?)`,
            [now, topicId],
          )
        }
      })
    },

    async renameTopic(topicId: string, title: string): Promise<void> {
      const t = topicTitleSchema.parse(title)
      const res = await db.run('UPDATE exam_topics SET title = ?, updated_at = ? WHERE id = ?', [t, nowISO(), topicId])
      if (res.changes === 0) throw new NotFoundError('Topic')
    },

    /** Swaps a topic with its neighbour above (-1) or below (+1). Renumbers first so equal orders can't stick. */
    async moveTopic(topicId: string, direction: -1 | 1): Promise<void> {
      await db.transaction(async (tx) => {
        const owner = await tx.query<{ exam_id: string }>('SELECT exam_id FROM exam_topics WHERE id = ?', [topicId])
        if (!owner[0]) throw new NotFoundError('Topic')
        const ids = (
          await tx.query<{ id: string }>('SELECT id FROM exam_topics WHERE exam_id = ? ORDER BY sort_order, created_at', [owner[0].exam_id])
        ).map((r) => r.id)
        const i = ids.indexOf(topicId)
        const j = i + direction
        if (j < 0 || j >= ids.length) return
        ;[ids[i], ids[j]] = [ids[j]!, ids[i]!]
        const now = nowISO()
        for (const [k, id] of ids.entries()) {
          await tx.run('UPDATE exam_topics SET sort_order = ?, updated_at = ? WHERE id = ?', [(k + 1) * 10, now, id])
        }
      })
    },

    async removeTopic(topicId: string): Promise<void> {
      await db.run('DELETE FROM exam_topics WHERE id = ?', [topicId])
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

    /** Attached files stay in Files; only the links go. */
    async remove(id: string): Promise<void> {
      await db.transaction(async (tx) => {
        await unlinkTarget(tx, 'exam', id)
        await tx.run('DELETE FROM exams WHERE id = ?', [id])
      })
    },
  }
}

export type ExamRepository = ReturnType<typeof createExamRepository>
