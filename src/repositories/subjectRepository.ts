import type { SqlDatabase } from '@/db/types'
import type { ClassSlotView, Subject } from '@/types/models'
import { nowISO, uuid } from '@/utils/id'
import {
  classSlotSchema,
  subjectSchema,
  type ClassSlotInput,
  type SubjectInput,
} from '@/validation/schemas'
import { AppError, NotFoundError, friendlyDbError } from './errors'

interface SubjectRow {
  id: string
  semester_id: string
  name: string
  code: string | null
  instructor: string | null
  room: string | null
  color: string
  notes: string | null
}

interface SlotRow {
  id: string
  subject_id: string
  day_of_week: number
  start_time: string
  end_time: string
  room: string | null
  subject_name: string
  subject_color: string
  instructor: string | null
  subject_room: string | null
}

const toSubject = (r: SubjectRow): Subject => ({
  id: r.id,
  semesterId: r.semester_id,
  name: r.name,
  code: r.code,
  instructor: r.instructor,
  room: r.room,
  color: r.color,
  notes: r.notes,
})

const toSlotView = (r: SlotRow): ClassSlotView => ({
  id: r.id,
  subjectId: r.subject_id,
  dayOfWeek: r.day_of_week,
  startTime: r.start_time,
  endTime: r.end_time,
  room: r.room,
  subjectName: r.subject_name,
  subjectColor: r.subject_color,
  instructor: r.instructor,
  displayRoom: r.room ?? r.subject_room,
})

const SLOT_SELECT = `
  SELECT cs.*, s.name AS subject_name, s.color AS subject_color, s.instructor, s.room AS subject_room
  FROM class_schedules cs JOIN subjects s ON s.id = cs.subject_id`

const DUPLICATE_SUBJECT = 'You already have a subject with that name this term.'

export function createSubjectRepository(db: SqlDatabase) {
  return {
    async list(semesterId: string): Promise<Subject[]> {
      const rows = await db.query<SubjectRow>(
        'SELECT * FROM subjects WHERE semester_id = ? AND archived_at IS NULL ORDER BY name COLLATE NOCASE',
        [semesterId],
      )
      return rows.map(toSubject)
    },

    async get(id: string): Promise<Subject> {
      const rows = await db.query<SubjectRow>('SELECT * FROM subjects WHERE id = ?', [id])
      if (!rows[0]) throw new NotFoundError('Subject')
      return toSubject(rows[0])
    },

    async create(semesterId: string, input: SubjectInput): Promise<string> {
      const d = subjectSchema.parse(input)
      const id = uuid()
      const now = nowISO()
      try {
        await db.run(
          `INSERT INTO subjects (id, semester_id, name, code, instructor, room, color, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, semesterId, d.name, d.code, d.instructor, d.room, d.color, d.notes, now, now],
        )
      } catch (err) {
        throw friendlyDbError(err, DUPLICATE_SUBJECT)
      }
      return id
    },

    async update(id: string, input: SubjectInput): Promise<void> {
      const d = subjectSchema.parse(input)
      try {
        const res = await db.run(
          `UPDATE subjects SET name = ?, code = ?, instructor = ?, room = ?, color = ?, notes = ?, updated_at = ?
           WHERE id = ?`,
          [d.name, d.code, d.instructor, d.room, d.color, d.notes, nowISO(), id],
        )
        if (res.changes === 0) throw new NotFoundError('Subject')
      } catch (err) {
        throw friendlyDbError(err, DUPLICATE_SUBJECT)
      }
    },

    /** What deleting a subject would touch — shown in the confirmation. */
    async usage(id: string): Promise<{ classes: number; tasks: number; exams: number }> {
      const rows = await db.query<{ classes: number; tasks: number; exams: number }>(
        `SELECT
          (SELECT COUNT(*) FROM class_schedules WHERE subject_id = ?) AS classes,
          (SELECT COUNT(*) FROM tasks WHERE subject_id = ?) AS tasks,
          (SELECT COUNT(*) FROM exams WHERE subject_id = ?) AS exams`,
        [id, id, id],
      )
      return rows[0] ?? { classes: 0, tasks: 0, exams: 0 }
    },

    /** Removes the subject and its class times. Tasks and exams are kept, just unlinked. */
    async remove(id: string): Promise<void> {
      await db.transaction(async (tx) => {
        await tx.run('DELETE FROM class_schedules WHERE subject_id = ?', [id])
        await tx.run('UPDATE tasks SET subject_id = NULL, updated_at = ? WHERE subject_id = ?', [nowISO(), id])
        await tx.run('UPDATE exams SET subject_id = NULL, updated_at = ? WHERE subject_id = ?', [nowISO(), id])
        await tx.run('DELETE FROM subjects WHERE id = ?', [id])
      })
    },

    // ---- Class schedule ----

    async listSlots(semesterId: string): Promise<ClassSlotView[]> {
      const rows = await db.query<SlotRow>(
        `${SLOT_SELECT} WHERE s.semester_id = ? AND s.archived_at IS NULL ORDER BY cs.day_of_week, cs.start_time`,
        [semesterId],
      )
      return rows.map(toSlotView)
    },

    async listSlotsForSubject(subjectId: string): Promise<ClassSlotView[]> {
      const rows = await db.query<SlotRow>(`${SLOT_SELECT} WHERE cs.subject_id = ? ORDER BY cs.day_of_week, cs.start_time`, [
        subjectId,
      ])
      return rows.map(toSlotView)
    },

    /** Adds the same class time on several days at once (e.g. MWF), all or nothing. */
    async addSlots(input: ClassSlotInput): Promise<void> {
      const d = classSlotSchema.parse(input)
      const now = nowISO()
      try {
        await db.transaction(async (tx) => {
          for (const day of d.days) {
            await tx.run(
              `INSERT INTO class_schedules (id, subject_id, day_of_week, start_time, end_time, room, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [uuid(), d.subjectId, day, d.startTime, d.endTime, d.room, now, now],
            )
          }
        })
      } catch (err) {
        throw friendlyDbError(err, 'That class is already on your schedule at this time.')
      }
    },

    async updateSlot(id: string, input: ClassSlotInput): Promise<void> {
      const d = classSlotSchema.parse(input)
      if (d.days.length !== 1) throw new AppError('Pick one day when editing a class time.')
      try {
        await db.run(
          `UPDATE class_schedules SET subject_id = ?, day_of_week = ?, start_time = ?, end_time = ?, room = ?, updated_at = ?
           WHERE id = ?`,
          [d.subjectId, d.days[0]!, d.startTime, d.endTime, d.room, nowISO(), id],
        )
      } catch (err) {
        throw friendlyDbError(err, 'That class is already on your schedule at this time.')
      }
    },

    async removeSlot(id: string): Promise<void> {
      await db.run('DELETE FROM class_schedules WHERE id = ?', [id])
    },
  }
}

export type SubjectRepository = ReturnType<typeof createSubjectRepository>
