import { beforeEach, describe, expect, it } from 'vitest'
import initSqlJs from 'sql.js'
import { migrate } from '@/db/migrate'
import { MIGRATIONS, SCHEMA_VERSION } from '@/db/migrations'
import { SerializedDatabase } from '@/db/SerializedDatabase'
import { createSqlJsDriver } from '@/db/sqljsDriver'
import { uuid } from '@/utils/id'
import { parseBackup } from './backupRepository'
import type { NewFile } from './fileRepository'
import { createRepositories, type Repositories } from './index'

let repos: Repositories
let semesterId: string
let subjectId: string

async function emptyDb() {
  const SQL = await initSqlJs()
  return new SerializedDatabase(createSqlJsDriver(new SQL.Database()))
}

const file = (over: Partial<NewFile> = {}): NewFile => {
  const id = over.id ?? uuid()
  return {
    id,
    name: 'Networking Reviewer',
    originalName: 'reviewer.pdf',
    mimeType: 'application/pdf',
    kind: 'pdf',
    sizeBytes: 1000,
    path: `files/${id}.pdf`,
    thumbPath: null,
    fingerprint: null,
    subjectId: null,
    description: null,
    ...over,
  }
}

const task = (title: string) => ({
  title,
  subjectId: null,
  description: null,
  kind: 'assignment' as const,
  dueDate: null,
  dueTime: null,
  priority: 'medium' as const,
  status: 'todo' as const,
})

beforeEach(async () => {
  const db = await emptyDb()
  await migrate(db)
  repos = createRepositories(db)
  await db.transaction((tx) =>
    repos.settings.completeOnboarding(tx, { studentName: 'Alex', schoolName: null, currency: 'PHP' }, { name: 'Term', academicYear: null }),
  )
  semesterId = (await repos.settings.currentSemester())!.id
  subjectId = await repos.subjects.create(semesterId, { name: 'Networking', code: null, instructor: null, room: null, color: '#4F46E5', notes: null })
})

describe('migration 003', () => {
  it('adds files to a version 2 database without touching existing data', async () => {
    const db = await emptyDb()
    await migrate(db, MIGRATIONS.filter((m) => m.version <= 2))
    await db.run(`INSERT INTO semesters (id, name) VALUES ('s1', 'Term')`)
    await db.run(`INSERT INTO notes (id, body) VALUES ('n1', 'kept')`)
    await expect(migrate(db)).resolves.toBe(SCHEMA_VERSION)
    const r = createRepositories(db)
    expect((await r.notes.get('n1')).body).toBe('kept')
    expect(await r.files.list()).toEqual([])
  })
})

describe('files', () => {
  it('stores metadata, filters by subject and searches names and descriptions', async () => {
    await repos.files.create(file({ subjectId, description: 'OSI model chapter' }))
    await repos.files.create(file({ name: 'Whiteboard', kind: 'image', mimeType: 'image/jpeg', path: `files/${uuid()}.jpg` }))
    expect(await repos.files.list({ subjectId })).toHaveLength(1)
    expect(await repos.files.list({ subjectId: 'none' })).toHaveLength(1)
    expect(await repos.files.list({ search: 'osi' })).toHaveLength(1)
    expect((await repos.files.list({ sort: 'name' })).map((f) => f.name)).toEqual(['Networking Reviewer', 'Whiteboard'])
    const counts = await repos.files.countsBySubject()
    expect(counts.find((c) => c.subjectId === subjectId)?.count).toBe(1)
    const storage = await repos.files.storage()
    expect(storage).toMatchObject({ count: 2, bytes: 2000 })
    expect(storage.byKind.image.count).toBe(1)
  })

  it('rejects an empty name', async () => {
    await expect(repos.files.create(file({ name: '  ' }))).rejects.toThrow(/name/)
  })

  it('renames, moves and describes', async () => {
    const f = file()
    await repos.files.create(f)
    await repos.files.update(f.id, { name: 'Lecture 3', subjectId, description: 'Slides' })
    expect(await repos.files.get(f.id)).toMatchObject({ name: 'Lecture 3', subjectId, subjectName: 'Networking', description: 'Slides' })
  })

  it('finds a duplicate by fingerprint', async () => {
    await repos.files.create(file({ fingerprint: '1000:abc' }))
    expect(await repos.files.findDuplicate('1000:abc')).not.toBeNull()
    expect(await repos.files.findDuplicate('1000:xyz')).toBeNull()
    expect(await repos.files.findDuplicate(null)).toBeNull()
  })

  it('keeps files when their subject is deleted', async () => {
    const f = file({ subjectId })
    await repos.files.create(f)
    await repos.subjects.remove(subjectId)
    expect((await repos.files.get(f.id)).subjectId).toBeNull()
  })
})

describe('attachments', () => {
  it('attaches one stored file to several records without copying it', async () => {
    const f = file()
    await repos.files.create(f)
    const t1 = uuid()
    const t2 = uuid()
    await repos.tasks.create(t1, task('Database assignment'))
    await repos.tasks.create(t2, task('Lab report'))
    await repos.files.link([f.id], 'task', t1)
    await repos.files.link([f.id], 'task', t2)
    await repos.files.link([f.id], 'task', t2)
    expect((await repos.files.get(f.id)).linkCount).toBe(2)
    expect((await repos.files.links(f.id)).map((l) => l.targetTitle)).toEqual(['Database assignment', 'Lab report'])
    expect(await repos.files.attachedTo('task', t1)).toHaveLength(1)
    expect(await repos.files.list()).toHaveLength(1)
  })

  it('detaching keeps the file', async () => {
    const f = file()
    await repos.files.create(f)
    const t = uuid()
    await repos.tasks.create(t, task('A'))
    await repos.files.link([f.id], 'task', t)
    await repos.files.unlink(f.id, 'task', t)
    expect(await repos.files.attachedTo('task', t)).toHaveLength(0)
    expect((await repos.files.get(f.id)).linkCount).toBe(0)
  })

  it('removes links, not files, when a task, exam or note is deleted', async () => {
    const f = file()
    await repos.files.create(f)
    const t = uuid()
    const n = uuid()
    const e = uuid()
    await repos.tasks.create(t, task('A'))
    await repos.notes.create(n, { title: 'N', body: '', subjectId: null, pinned: false })
    await repos.exams.create(e, { title: 'Quiz', subjectId: null, kind: 'quiz', date: '2026-10-20', time: null, coverage: null, notes: null, studyStatus: 'not_started' })
    for (const [type, id] of [['task', t], ['note', n], ['exam', e]] as const) await repos.files.link([f.id], type, id)
    await repos.tasks.remove(t)
    await repos.notes.remove(n)
    await repos.exams.remove(e)
    expect((await repos.files.get(f.id)).linkCount).toBe(0)
  })

  it('links at creation only when the target exists, and refuses linking to a missing record', async () => {
    const t = uuid()
    await repos.tasks.create(t, task('A'))
    const f = file()
    await repos.files.create(f, [{ type: 'task', id: t }, { type: 'note', id: 'not-saved-yet' }])
    expect((await repos.files.get(f.id)).linkCount).toBe(1)
    await expect(repos.files.link([f.id], 'note', 'missing')).rejects.toThrow(/could not be found/)
  })

  it('deleting a file removes its record and links and returns its paths', async () => {
    const f = file({ thumbPath: 'thumbs/x.jpg' })
    await repos.files.create(f)
    const t = uuid()
    await repos.tasks.create(t, task('A'))
    await repos.files.link([f.id], 'task', t)
    expect(await repos.files.remove(f.id)).toEqual({ path: f.path, thumbPath: 'thumbs/x.jpg' })
    expect(await repos.files.attachedTo('task', t)).toHaveLength(0)
    expect(await repos.files.remove(f.id)).toBeNull()
  })
})

describe('backup', () => {
  it('includes files and their links', async () => {
    const f = file({ subjectId })
    await repos.files.create(f)
    const t = uuid()
    await repos.tasks.create(t, task('A'))
    await repos.files.link([f.id], 'task', t)
    const backup = parseBackup(JSON.stringify(await repos.backup.exportAll('test')))
    await repos.files.remove(f.id)
    await repos.backup.restore(backup)
    const restored = await repos.files.get(f.id)
    expect(restored).toMatchObject({ path: f.path, subjectName: 'Networking', linkCount: 1 })
  })
})
