import type { SqlDatabase } from '@/db/types'
import type { Task, TaskStatus } from '@/types/models'
import { nowISO } from '@/utils/id'
import { taskSchema, type TaskInput } from '@/validation/schemas'
import { NotFoundError, friendlyDbError } from './errors'
import { unlinkTarget } from './fileRepository'

interface TaskRow {
  id: string
  subject_id: string | null
  subject_name: string | null
  subject_color: string | null
  title: string
  description: string | null
  kind: Task['kind']
  due_date: string | null
  due_time: string | null
  priority: Task['priority']
  status: TaskStatus
  completed_at: string | null
  created_at: string
}

const toTask = (r: TaskRow): Task => ({
  id: r.id,
  subjectId: r.subject_id,
  subjectName: r.subject_name,
  subjectColor: r.subject_color,
  title: r.title,
  description: r.description,
  kind: r.kind,
  dueDate: r.due_date,
  dueTime: r.due_time,
  priority: r.priority,
  status: r.status,
  completedAt: r.completed_at,
  createdAt: r.created_at,
})

const SELECT = `
  SELECT t.*, s.name AS subject_name, s.color AS subject_color
  FROM tasks t LEFT JOIN subjects s ON s.id = t.subject_id`

export function createTaskRepository(db: SqlDatabase) {
  return {
    /** Open tasks plus anything completed in the last 30 days. */
    async list(): Promise<Task[]> {
      const rows = await db.query<TaskRow>(
        `${SELECT} WHERE t.status <> 'completed' OR t.completed_at >= ? ORDER BY t.due_date, t.due_time`,
        [new Date(Date.now() - 30 * 86_400_000).toISOString()],
      )
      return rows.map(toTask)
    },

    async get(id: string): Promise<Task> {
      const rows = await db.query<TaskRow>(`${SELECT} WHERE t.id = ?`, [id])
      if (!rows[0]) throw new NotFoundError('Task')
      return toTask(rows[0])
    },

    async listForSubject(subjectId: string): Promise<Task[]> {
      const rows = await db.query<TaskRow>(`${SELECT} WHERE t.subject_id = ? ORDER BY t.due_date, t.due_time`, [subjectId])
      return rows.map(toTask)
    },

    /**
     * Creates the task with a caller-supplied id. Submitting the same form twice
     * (double tap, slow device) hits the primary key and is treated as already saved.
     */
    async create(id: string, input: TaskInput): Promise<void> {
      const d = taskSchema.parse(input)
      const now = nowISO()
      try {
        await db.run(
          `INSERT INTO tasks (id, subject_id, title, description, kind, due_date, due_time, priority, status, completed_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            d.subjectId,
            d.title,
            d.description,
            d.kind,
            d.dueDate,
            d.dueDate ? d.dueTime : null,
            d.priority,
            d.status,
            d.status === 'completed' ? now : null,
            now,
            now,
          ],
        )
      } catch (err) {
        if (/UNIQUE constraint failed: tasks.id/i.test(String(err))) return
        throw friendlyDbError(err)
      }
    },

    async update(id: string, input: TaskInput): Promise<void> {
      const d = taskSchema.parse(input)
      const now = nowISO()
      const res = await db.run(
        `UPDATE tasks SET subject_id = ?, title = ?, description = ?, kind = ?, due_date = ?, due_time = ?, priority = ?,
           status = ?, completed_at = CASE WHEN ? = 'completed' THEN COALESCE(completed_at, ?) ELSE NULL END, updated_at = ?
         WHERE id = ?`,
        [
          d.subjectId,
          d.title,
          d.description,
          d.kind,
          d.dueDate,
          d.dueDate ? d.dueTime : null,
          d.priority,
          d.status,
          d.status,
          now,
          now,
          id,
        ],
      )
      if (res.changes === 0) throw new NotFoundError('Task')
    },

    async setStatus(id: string, status: TaskStatus): Promise<void> {
      const now = nowISO()
      await db.run(
        `UPDATE tasks SET status = ?, completed_at = CASE WHEN ? = 'completed' THEN ? ELSE NULL END, updated_at = ? WHERE id = ?`,
        [status, status, now, now, id],
      )
    },

    /** Attached files stay in Files; only the links go. */
    async remove(id: string): Promise<void> {
      await db.transaction(async (tx) => {
        await unlinkTarget(tx, 'task', id)
        await tx.run('DELETE FROM tasks WHERE id = ?', [id])
      })
    },
  }
}

export type TaskRepository = ReturnType<typeof createTaskRepository>
