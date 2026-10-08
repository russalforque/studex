import type { SqlDatabase, SqlExecutor } from '@/db/types'
import type { FileKind, FileLink, LinkTargetType, StudyFile } from '@/types/models'
import { nowISO } from '@/utils/id'
import { AppError, NotFoundError } from './errors'

interface FileRow {
  id: string
  name: string
  original_name: string | null
  mime_type: string
  kind: FileKind
  size_bytes: number
  path: string
  thumb_path: string | null
  subject_id: string | null
  subject_name: string | null
  subject_color: string | null
  description: string | null
  link_count: number
  created_at: string
  updated_at: string
}

const toFile = (r: FileRow): StudyFile => ({
  id: r.id,
  name: r.name,
  originalName: r.original_name,
  mimeType: r.mime_type,
  kind: r.kind,
  sizeBytes: r.size_bytes,
  path: r.path,
  thumbPath: r.thumb_path,
  subjectId: r.subject_id,
  subjectName: r.subject_name,
  subjectColor: r.subject_color,
  description: r.description,
  linkCount: r.link_count ?? 0,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

const SELECT = `
  SELECT f.*, s.name AS subject_name, s.color AS subject_color,
    (SELECT COUNT(*) FROM file_links l WHERE l.file_id = f.id) AS link_count
  FROM files f LEFT JOIN subjects s ON s.id = f.subject_id`

export interface NewFile {
  id: string
  name: string
  originalName: string | null
  mimeType: string
  kind: FileKind
  sizeBytes: number
  path: string
  thumbPath: string | null
  fingerprint: string | null
  subjectId: string | null
  description: string | null
}

export type FileSort = 'recent' | 'name'

export interface FileQuery {
  /** A subject id, 'none' for files without a subject, or undefined for all. */
  subjectId?: string
  search?: string
  kind?: FileKind
  sort?: FileSort
  limit?: number
  offset?: number
}

export interface SubjectFileCount {
  subjectId: string | null
  name: string | null
  color: string | null
  count: number
}

export interface StorageSummary {
  count: number
  bytes: number
  byKind: Record<FileKind, { count: number; bytes: number }>
}

const MAX_NAME = 120
const MAX_DESCRIPTION = 500

function cleanText(v: string | null, max: number): string | null {
  const t = (v ?? '').trim()
  return t ? t.slice(0, max) : null
}

function requireName(name: string): string {
  const n = name.trim()
  if (!n) throw new AppError('Give the file a name.')
  if (n.length > MAX_NAME) throw new AppError(`Keep the name under ${MAX_NAME} characters.`)
  return n
}

/** `%` and `_` typed by the student are matched literally. */
const like = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`

async function targetExists(ex: SqlExecutor, type: LinkTargetType, id: string): Promise<boolean> {
  const table = { task: 'tasks', exam: 'exams', note: 'notes' }[type]
  return (await ex.query(`SELECT 1 FROM ${table} WHERE id = ?`, [id])).length > 0
}

/** Metadata and links only. Reading and writing the files themselves is the file store's job. */
export function createFileRepository(db: SqlDatabase) {
  return {
    async list(q: FileQuery = {}): Promise<StudyFile[]> {
      const where: string[] = []
      const params: Array<string | number> = []
      if (q.subjectId === 'none') where.push('f.subject_id IS NULL')
      else if (q.subjectId) {
        where.push('f.subject_id = ?')
        params.push(q.subjectId)
      }
      if (q.kind) {
        where.push('f.kind = ?')
        params.push(q.kind)
      }
      const search = q.search?.trim()
      if (search) {
        where.push(`(f.name LIKE ? ESCAPE '\\' OR f.original_name LIKE ? ESCAPE '\\' OR f.description LIKE ? ESCAPE '\\')`)
        params.push(like(search), like(search), like(search))
      }
      const order = q.sort === 'name' ? 'f.name COLLATE NOCASE, f.created_at DESC' : 'f.created_at DESC'
      params.push(q.limit ?? 200, q.offset ?? 0)
      const rows = await db.query<FileRow>(
        `${SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY ${order} LIMIT ? OFFSET ?`,
        params,
      )
      return rows.map(toFile)
    },

    async get(id: string): Promise<StudyFile> {
      const rows = await db.query<FileRow>(`${SELECT} WHERE f.id = ?`, [id])
      if (!rows[0]) throw new NotFoundError('File')
      return toFile(rows[0])
    },

    /** Files of one subject, newest first, for the subject page. */
    async forSubject(subjectId: string): Promise<StudyFile[]> {
      const rows = await db.query<FileRow>(`${SELECT} WHERE f.subject_id = ? ORDER BY f.created_at DESC`, [subjectId])
      return rows.map(toFile)
    },

    /** Files attached to one task, exam or note, in the order they were attached. */
    async attachedTo(type: LinkTargetType, targetId: string): Promise<StudyFile[]> {
      const rows = await db.query<FileRow>(
        `${SELECT} JOIN file_links k ON k.file_id = f.id WHERE k.target_type = ? AND k.target_id = ? ORDER BY k.created_at, k.rowid`,
        [type, targetId],
      )
      return rows.map(toFile)
    },

    async findDuplicate(fingerprint: string | null): Promise<StudyFile | null> {
      if (!fingerprint) return null
      const rows = await db.query<FileRow>(`${SELECT} WHERE f.fingerprint = ? LIMIT 1`, [fingerprint])
      return rows[0] ? toFile(rows[0]) : null
    },

    /** Records a file whose bytes are already stored, and attaches it in the same transaction. */
    async create(f: NewFile, attachTo: Array<{ type: LinkTargetType; id: string }> = []): Promise<void> {
      const now = nowISO()
      await db.transaction(async (tx) => {
        await tx.run(
          `INSERT INTO files (id, name, original_name, mime_type, kind, size_bytes, path, thumb_path, fingerprint, subject_id, description, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            f.id,
            requireName(f.name),
            f.originalName,
            f.mimeType,
            f.kind,
            f.sizeBytes,
            f.path,
            f.thumbPath,
            f.fingerprint,
            f.subjectId,
            cleanText(f.description, MAX_DESCRIPTION),
            now,
            now,
          ],
        )
        for (const t of attachTo) {
          // A target that doesn't exist yet (a task still being created) is linked when it's saved.
          if (await targetExists(tx, t.type, t.id)) {
            await tx.run('INSERT OR IGNORE INTO file_links (file_id, target_type, target_id, created_at) VALUES (?, ?, ?, ?)', [
              f.id,
              t.type,
              t.id,
              now,
            ])
          }
        }
      })
    },

    async update(id: string, patch: { name?: string; subjectId?: string | null; description?: string | null }): Promise<void> {
      const sets: string[] = []
      const params: Array<string | null> = []
      if (patch.name !== undefined) {
        sets.push('name = ?')
        params.push(requireName(patch.name))
      }
      if (patch.subjectId !== undefined) {
        sets.push('subject_id = ?')
        params.push(patch.subjectId)
      }
      if (patch.description !== undefined) {
        sets.push('description = ?')
        params.push(cleanText(patch.description, MAX_DESCRIPTION))
      }
      if (sets.length === 0) return
      const res = await db.run(`UPDATE files SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`, [...params, nowISO(), id])
      if (res.changes === 0) throw new NotFoundError('File')
    },

    /** Removes the record (and its links). Returns the paths so the caller can delete the bytes afterwards. */
    async remove(id: string): Promise<{ path: string; thumbPath: string | null } | null> {
      return db.transaction(async (tx) => {
        const rows = await tx.query<{ path: string; thumb_path: string | null }>('SELECT path, thumb_path FROM files WHERE id = ?', [id])
        if (!rows[0]) return null
        await tx.run('DELETE FROM files WHERE id = ?', [id])
        return { path: rows[0].path, thumbPath: rows[0].thumb_path }
      })
    },

    // ---- Links ----

    async links(fileId: string): Promise<FileLink[]> {
      const rows = await db.query<{ file_id: string; target_type: LinkTargetType; target_id: string; title: string | null }>(
        `SELECT l.file_id, l.target_type, l.target_id,
           CASE l.target_type
             WHEN 'task' THEN (SELECT title FROM tasks WHERE id = l.target_id)
             WHEN 'exam' THEN (SELECT title FROM exams WHERE id = l.target_id)
             ELSE (SELECT COALESCE(NULLIF(title, ''), substr(body, 1, 60)) FROM notes WHERE id = l.target_id)
           END AS title
         FROM file_links l WHERE l.file_id = ? ORDER BY l.created_at, l.rowid`,
        [fileId],
      )
      return rows.map((r) => ({ fileId: r.file_id, targetType: r.target_type, targetId: r.target_id, targetTitle: r.title ?? 'Untitled' }))
    },

    async link(fileIds: string[], type: LinkTargetType, targetId: string): Promise<void> {
      await db.transaction(async (tx) => {
        if (!(await targetExists(tx, type, targetId))) throw new NotFoundError({ task: 'Task', exam: 'Exam', note: 'Note' }[type])
        const now = nowISO()
        for (const id of fileIds) {
          await tx.run('INSERT OR IGNORE INTO file_links (file_id, target_type, target_id, created_at) VALUES (?, ?, ?, ?)', [id, type, targetId, now])
        }
      })
    },

    /** Detaching never deletes the file itself; it stays in Files. */
    async unlink(fileId: string, type: LinkTargetType, targetId: string): Promise<void> {
      await db.run('DELETE FROM file_links WHERE file_id = ? AND target_type = ? AND target_id = ?', [fileId, type, targetId])
    },

    // ---- Overview ----

    async countsBySubject(): Promise<SubjectFileCount[]> {
      const rows = await db.query<{ subject_id: string | null; name: string | null; color: string | null; n: number }>(
        `SELECT f.subject_id, s.name, s.color, COUNT(*) AS n
         FROM files f LEFT JOIN subjects s ON s.id = f.subject_id
         GROUP BY f.subject_id ORDER BY s.name IS NULL, s.name COLLATE NOCASE`,
      )
      return rows.map((r) => ({ subjectId: r.subject_id, name: r.name, color: r.color, count: r.n }))
    },

    async storage(): Promise<StorageSummary> {
      const rows = await db.query<{ kind: FileKind; n: number; bytes: number }>(
        'SELECT kind, COUNT(*) AS n, COALESCE(SUM(size_bytes), 0) AS bytes FROM files GROUP BY kind',
      )
      const byKind = { image: { count: 0, bytes: 0 }, pdf: { count: 0, bytes: 0 }, doc: { count: 0, bytes: 0 }, text: { count: 0, bytes: 0 } }
      for (const r of rows) byKind[r.kind] = { count: r.n, bytes: r.bytes }
      const all = Object.values(byKind)
      return { count: all.reduce((n, k) => n + k.count, 0), bytes: all.reduce((n, k) => n + k.bytes, 0), byKind }
    },

    /** Every stored path, for the consistency check that removes files nothing refers to. */
    async allPaths(): Promise<Array<{ id: string; path: string; thumbPath: string | null }>> {
      const rows = await db.query<{ id: string; path: string; thumb_path: string | null }>('SELECT id, path, thumb_path FROM files')
      return rows.map((r) => ({ id: r.id, path: r.path, thumbPath: r.thumb_path }))
    },

    async setThumb(id: string, thumbPath: string | null): Promise<void> {
      await db.run('UPDATE files SET thumb_path = ? WHERE id = ?', [thumbPath, id])
    },
  }
}

export type FileRepository = ReturnType<typeof createFileRepository>

/** Used by the task, exam and note repositories when a record is deleted. */
export async function unlinkTarget(ex: SqlExecutor, type: LinkTargetType, targetId: string): Promise<void> {
  await ex.run('DELETE FROM file_links WHERE target_type = ? AND target_id = ?', [type, targetId])
}
