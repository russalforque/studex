import type { Migration } from './index'

const NOW = `(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`

/**
 * Walkthrough and feature-tip progress. This is about the device, not the student's records, so
 * it is left out of backups: restoring onto a new phone offers the tour again.
 */
export const migration004: Migration = {
  version: 4,
  name: 'guide progress',
  statements: [
    // id: 'tour' for the app tour, 'tip.<name>' for one-time feature tips.
    // version: the guide version the student last finished, skipped or saw.
    // step: how far they got, so a skipped tour can be told apart from one never started.
    `CREATE TABLE guide_progress (
      id TEXT PRIMARY KEY NOT NULL,
      version INTEGER NOT NULL CHECK (version >= 0),
      status TEXT NOT NULL CHECK (status IN ('started', 'completed', 'skipped', 'seen')),
      step INTEGER NOT NULL DEFAULT 0 CHECK (step >= 0),
      updated_at TEXT NOT NULL DEFAULT ${NOW}
    )`,
  ],
}
