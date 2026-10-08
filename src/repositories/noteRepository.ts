import type { SqlDatabase } from '@/db/types'
import type { Note } from '@/types/models'
import { nowISO } from '@/utils/id'
import { noteSchema, type NoteInput } from '@/validation/schemas'
import { NotFoundError, friendlyDbError } from './errors'
import { unlinkTarget } from './fileRepository'

interface NoteRow {
  id: string
  subject_id: string | null
  subject_name: string | null
  subject_color: string | null
  title: string | null
  body: string
  pinned: number
  updated_at: string
}

const toNote = (r: NoteRow): Note => ({
  id: r.id,
  subjectId: r.subject_id,
  subjectName: r.subject_name,
  subjectColor: r.subject_color,
  title: r.title,
  body: r.body,
  pinned: r.pinned === 1,
  updatedAt: r.updated_at,
})

const SELECT = `
  SELECT n.*, s.name AS subject_name, s.color AS subject_color
  FROM notes n LEFT JOIN subjects s ON s.id = n.subject_id`

export function createNoteRepository(db: SqlDatabase) {
  return {
    /** Pinned first, then most recently edited. */
    async list(subjectId?: string): Promise<Note[]> {
      const rows = subjectId
        ? await db.query<NoteRow>(`${SELECT} WHERE n.subject_id = ? ORDER BY n.pinned DESC, n.updated_at DESC`, [subjectId])
        : await db.query<NoteRow>(`${SELECT} ORDER BY n.pinned DESC, n.updated_at DESC LIMIT 500`)
      return rows.map(toNote)
    },

    async get(id: string): Promise<Note> {
      const rows = await db.query<NoteRow>(`${SELECT} WHERE n.id = ?`, [id])
      if (!rows[0]) throw new NotFoundError('Note')
      return toNote(rows[0])
    },

    /** Idempotent on `id`, like tasks and expenses. */
    async create(id: string, input: NoteInput): Promise<void> {
      const d = noteSchema.parse(input)
      const now = nowISO()
      try {
        await db.run(
          `INSERT INTO notes (id, subject_id, title, body, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [id, d.subjectId, d.title, d.body, d.pinned ? 1 : 0, now, now],
        )
      } catch (err) {
        if (/UNIQUE constraint failed: notes.id/i.test(String(err))) return
        throw friendlyDbError(err)
      }
    },

    async update(id: string, input: NoteInput): Promise<void> {
      const d = noteSchema.parse(input)
      const res = await db.run('UPDATE notes SET subject_id = ?, title = ?, body = ?, pinned = ?, updated_at = ? WHERE id = ?', [
        d.subjectId,
        d.title,
        d.body,
        d.pinned ? 1 : 0,
        nowISO(),
        id,
      ])
      if (res.changes === 0) throw new NotFoundError('Note')
    },

    /** Pinning doesn't count as an edit, so it keeps its place in "recently edited". */
    async setPinned(id: string, pinned: boolean): Promise<void> {
      await db.run('UPDATE notes SET pinned = ? WHERE id = ?', [pinned ? 1 : 0, id])
    },

    /** Attached files stay in Files; only the links go. */
    async remove(id: string): Promise<void> {
      await db.transaction(async (tx) => {
        await unlinkTarget(tx, 'note', id)
        await tx.run('DELETE FROM notes WHERE id = ?', [id])
      })
    },
  }
}

export type NoteRepository = ReturnType<typeof createNoteRepository>
