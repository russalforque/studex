import type { SqlDatabase, SqlExecutor } from '@/db/types'
import { parseFocusState, sessionRecord, type FocusState } from '@/domain/focus'
import type { StudySession } from '@/types/models'
import { nowISO } from '@/utils/id'

interface SessionRow {
  id: string
  subject_id: string | null
  subject_name: string | null
  subject_color: string | null
  planned_seconds: number
  focused_seconds: number
  started_at: string
  ended_at: string
  status: StudySession['status']
}

const toSession = (r: SessionRow): StudySession => ({
  id: r.id,
  subjectId: r.subject_id,
  subjectName: r.subject_name,
  subjectColor: r.subject_color,
  plannedSeconds: r.planned_seconds,
  focusedSeconds: r.focused_seconds,
  startedAt: r.started_at,
  endedAt: r.ended_at,
  status: r.status,
})

const SELECT = `
  SELECT ss.*, s.name AS subject_name, s.color AS subject_color
  FROM study_sessions ss LEFT JOIN subjects s ON s.id = ss.subject_id`

async function writeState(ex: SqlExecutor, state: FocusState | null): Promise<void> {
  if (state === null) {
    await ex.run('DELETE FROM focus_state WHERE id = 1')
    return
  }
  // INSERT OR REPLACE rather than an upsert clause: works on every SQLite the native plugins ship.
  await ex.run('INSERT OR REPLACE INTO focus_state (id, state, updated_at) VALUES (1, ?, ?)', [JSON.stringify(state), nowISO()])
}

/** The focus timer and study history. */
export function createFocusRepository(db: SqlDatabase) {
  return {
    async getState(): Promise<FocusState | null> {
      const rows = await db.query<{ state: string }>('SELECT state FROM focus_state WHERE id = 1')
      return parseFocusState(rows[0]?.state ?? null)
    },

    async saveState(state: FocusState | null): Promise<void> {
      await writeState(db, state)
    },

    /**
     * Ends the current phase: records the focus session (if it ran long enough) and replaces the
     * timer with `next` (a break, or nothing), together. Recording is keyed on the session id, so
     * finishing the same session twice — say, the app noticing on reopen and the student tapping
     * End at the same moment — stores it once.
     */
    async finish(state: FocusState, now: number, next: FocusState | null = null): Promise<StudySession['status'] | null> {
      const rec = sessionRecord(state, now)
      await db.transaction(async (tx) => {
        if (rec) {
          const ts = nowISO()
          await tx.run(
            `INSERT INTO study_sessions (id, subject_id, planned_seconds, focused_seconds, started_at, ended_at, status, created_at, updated_at)
             SELECT ?, (SELECT id FROM subjects WHERE id = ?), ?, ?, ?, ?, ?, ?, ?
             WHERE NOT EXISTS (SELECT 1 FROM study_sessions WHERE id = ?)`,
            [rec.id, rec.subjectId, rec.plannedSeconds, rec.focusedSeconds, rec.startedAt, rec.endedAt, rec.status, ts, ts, rec.id],
          )
        }
        await writeState(tx, next)
      })
      return rec?.status ?? null
    },

    /** Sessions that started in [fromTs, toTs), newest first. Bounds are UTC timestamps. */
    async sessionsBetween(fromTs: string, toTs: string): Promise<StudySession[]> {
      const rows = await db.query<SessionRow>(`${SELECT} WHERE ss.started_at >= ? AND ss.started_at < ? ORDER BY ss.started_at DESC`, [
        fromTs,
        toTs,
      ])
      return rows.map(toSession)
    },

    async recent(limit = 20): Promise<StudySession[]> {
      const rows = await db.query<SessionRow>(`${SELECT} ORDER BY ss.started_at DESC LIMIT ?`, [limit])
      return rows.map(toSession)
    },

    async remove(id: string): Promise<void> {
      await db.run('DELETE FROM study_sessions WHERE id = ?', [id])
    },
  }
}

export type FocusRepository = ReturnType<typeof createFocusRepository>
