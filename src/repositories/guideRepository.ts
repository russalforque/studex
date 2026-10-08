import type { SqlDatabase } from '@/db/types'
import type { GuideProgress, GuideStatus } from '@/types/models'
import { nowISO } from '@/utils/id'

interface GuideRow {
  id: string
  version: number
  status: GuideStatus
  step: number
  updated_at: string
}

const toProgress = (r: GuideRow): GuideProgress => ({
  id: r.id,
  version: r.version,
  status: r.status,
  step: r.step,
  updatedAt: r.updated_at,
})

/** Walkthrough and feature-tip progress (device state, not part of backups). */
export function createGuideRepository(db: SqlDatabase) {
  return {
    async list(): Promise<GuideProgress[]> {
      const rows = await db.query<GuideRow>('SELECT * FROM guide_progress ORDER BY id')
      return rows.map(toProgress)
    },

    async save(id: string, version: number, status: GuideStatus, step = 0): Promise<void> {
      await db.run(
        `INSERT INTO guide_progress (id, version, status, step, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET version = excluded.version, status = excluded.status,
           step = excluded.step, updated_at = excluded.updated_at`,
        [id, Math.max(0, Math.trunc(version)), status, Math.max(0, Math.trunc(step)), nowISO()],
      )
    },

    /** Forgets every feature tip so each shows once more. The tour's own record is kept. */
    async resetTips(): Promise<void> {
      await db.run("DELETE FROM guide_progress WHERE id LIKE 'tip.%'")
    },
  }
}
