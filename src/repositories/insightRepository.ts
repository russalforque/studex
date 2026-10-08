import type { SqlDatabase } from '@/db/types'
import type { Exam, Note, Subject, Task } from '@/types/models'
import { addDays, parseISODate, type ISODate } from '@/utils/dates'
import type { Minor } from '@/utils/money'

export interface WeekSummary {
  weekStart: ISODate
  tasksDone: number
  /** Open or done tasks due this week, so "8 / 10" reads naturally. */
  tasksDue: number
  classesAttended: number
  /** Classes marked this week, excused ones aside. */
  classesMarked: number
  studySeconds: number
  studySessions: number
  spent: Minor
  saved: Minor
  /** Exams and quizzes dated in this week. */
  examsInWeek: number
  /** For the current week: exams in the 7 days after today. */
  examsAhead: number
}

export interface SearchResults {
  subjects: Pick<Subject, 'id' | 'name' | 'code' | 'instructor' | 'color'>[]
  tasks: Pick<Task, 'id' | 'title' | 'dueDate' | 'status' | 'subjectName' | 'subjectColor'>[]
  exams: Pick<Exam, 'id' | 'title' | 'date' | 'kind' | 'subjectName' | 'subjectColor'>[]
  notes: Pick<Note, 'id' | 'title' | 'body' | 'subjectName' | 'subjectColor'>[]
}

const LIMIT = 15

/** `%` and `_` typed by the student are matched literally. */
function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
}

/** Read-only queries that span several areas: search and the weekly summary. */
export function createInsightRepository(db: SqlDatabase) {
  return {
    /** Simple case-insensitive matching over titles and text, newest and nearest first. */
    async search(query: string, semesterId: string | null): Promise<SearchResults> {
      const q = query.trim()
      if (q.length < 2) return { subjects: [], tasks: [], exams: [], notes: [] }
      const p = likePattern(q)
      const [subjects, tasks, exams, notes] = await Promise.all([
        db.query<{ id: string; name: string; code: string | null; instructor: string | null; color: string }>(
          `SELECT id, name, code, instructor, color FROM subjects
           WHERE semester_id = ? AND archived_at IS NULL
             AND (name LIKE ? ESCAPE '\\' OR code LIKE ? ESCAPE '\\' OR instructor LIKE ? ESCAPE '\\')
           ORDER BY name COLLATE NOCASE LIMIT ?`,
          [semesterId ?? '', p, p, p, LIMIT],
        ),
        db.query<{ id: string; title: string; due_date: string | null; status: Task['status']; subject_name: string | null; subject_color: string | null }>(
          `SELECT t.id, t.title, t.due_date, t.status, s.name AS subject_name, s.color AS subject_color
           FROM tasks t LEFT JOIN subjects s ON s.id = t.subject_id
           WHERE t.title LIKE ? ESCAPE '\\' OR t.description LIKE ? ESCAPE '\\'
           ORDER BY t.status = 'completed', t.due_date IS NULL, t.due_date DESC LIMIT ?`,
          [p, p, LIMIT],
        ),
        db.query<{ id: string; title: string; exam_date: string; kind: Exam['kind']; subject_name: string | null; subject_color: string | null }>(
          `SELECT e.id, e.title, e.exam_date, e.kind, s.name AS subject_name, s.color AS subject_color
           FROM exams e LEFT JOIN subjects s ON s.id = e.subject_id
           WHERE e.title LIKE ? ESCAPE '\\' OR e.coverage LIKE ? ESCAPE '\\' OR e.notes LIKE ? ESCAPE '\\'
           ORDER BY e.exam_date DESC LIMIT ?`,
          [p, p, p, LIMIT],
        ),
        db.query<{ id: string; title: string | null; body: string; subject_name: string | null; subject_color: string | null }>(
          `SELECT n.id, n.title, n.body, s.name AS subject_name, s.color AS subject_color
           FROM notes n LEFT JOIN subjects s ON s.id = n.subject_id
           WHERE n.title LIKE ? ESCAPE '\\' OR n.body LIKE ? ESCAPE '\\'
           ORDER BY n.updated_at DESC LIMIT ?`,
          [p, p, LIMIT],
        ),
      ])
      return {
        subjects,
        tasks: tasks.map((t) => ({
          id: t.id,
          title: t.title,
          dueDate: t.due_date,
          status: t.status,
          subjectName: t.subject_name,
          subjectColor: t.subject_color,
        })),
        exams: exams.map((e) => ({
          id: e.id,
          title: e.title,
          date: e.exam_date,
          kind: e.kind,
          subjectName: e.subject_name,
          subjectColor: e.subject_color,
        })),
        notes: notes.map((n) => ({ id: n.id, title: n.title, body: n.body, subjectName: n.subject_name, subjectColor: n.subject_color })),
      }
    },

    /**
     * Monday–Sunday totals for the week starting `weekStart`, worked out from the records
     * themselves each time (nothing is stored), so editing a past expense or task updates it.
     */
    async weekSummary(weekStart: ISODate, today: ISODate): Promise<WeekSummary> {
      const weekEnd = addDays(weekStart, 6)
      // completed_at and started_at are UTC timestamps; compare them with the local week's bounds.
      const fromTs = parseISODate(weekStart).toISOString()
      const toTs = parseISODate(addDays(weekEnd, 1)).toISOString()
      const isCurrent = today >= weekStart && today <= weekEnd
      const rows = await db.query<{
        done: number
        due: number
        attended: number
        marked: number
        study: number | null
        sessions: number
        spent: number | null
        saved: number | null
        exams_in: number
        exams_ahead: number
      }>(
        `SELECT
          (SELECT COUNT(*) FROM tasks WHERE status = 'completed' AND completed_at >= ? AND completed_at < ?) AS done,
          (SELECT COUNT(*) FROM tasks WHERE due_date BETWEEN ? AND ?
             OR (status = 'completed' AND completed_at >= ? AND completed_at < ?)) AS due,
          (SELECT COUNT(*) FROM attendance WHERE date BETWEEN ? AND ? AND status IN ('present', 'late')) AS attended,
          (SELECT COUNT(*) FROM attendance WHERE date BETWEEN ? AND ? AND status <> 'excused') AS marked,
          (SELECT SUM(focused_seconds) FROM study_sessions WHERE started_at >= ? AND started_at < ?) AS study,
          (SELECT COUNT(*) FROM study_sessions WHERE started_at >= ? AND started_at < ?) AS sessions,
          (SELECT SUM(amount_minor) FROM expenses WHERE spent_on BETWEEN ? AND ?) AS spent,
          (SELECT SUM(CASE kind WHEN 'deposit' THEN amount_minor ELSE -amount_minor END)
             FROM savings_transactions WHERE source <> 'initial' AND occurred_on BETWEEN ? AND ?) AS saved,
          (SELECT COUNT(*) FROM exams WHERE exam_date BETWEEN ? AND ?) AS exams_in,
          (SELECT COUNT(*) FROM exams WHERE exam_date BETWEEN ? AND ? AND study_status <> 'completed') AS exams_ahead`,
        [
          fromTs, toTs,
          weekStart, weekEnd, fromTs, toTs,
          weekStart, weekEnd,
          weekStart, weekEnd,
          fromTs, toTs,
          fromTs, toTs,
          weekStart, weekEnd,
          weekStart, weekEnd,
          weekStart, weekEnd,
          addDays(today, 1), addDays(today, 7),
        ],
      )
      const r = rows[0]
      return {
        weekStart,
        tasksDone: r?.done ?? 0,
        tasksDue: Math.max(r?.due ?? 0, r?.done ?? 0),
        classesAttended: r?.attended ?? 0,
        classesMarked: r?.marked ?? 0,
        studySeconds: r?.study ?? 0,
        studySessions: r?.sessions ?? 0,
        spent: r?.spent ?? 0,
        saved: r?.saved ?? 0,
        examsInWeek: r?.exams_in ?? 0,
        examsAhead: isCurrent ? (r?.exams_ahead ?? 0) : 0,
      }
    },
  }
}

export type InsightRepository = ReturnType<typeof createInsightRepository>
