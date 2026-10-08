import { MIGRATIONS, type Migration } from './migrations'
import type { SqlDatabase } from './types'

export class DatabaseTooNewError extends Error {
  constructor(dbVersion: number, appVersion: number) {
    super(
      `This database was created by a newer version of Studex (schema ${dbVersion}, app supports ${appVersion}). ` +
        'Update the app to open it. Your data has not been changed.',
    )
    this.name = 'DatabaseTooNewError'
  }
}

/**
 * Applies pending migrations in order. Each migration runs in its own transaction
 * together with its bookkeeping row, so a failure leaves the database at the last
 * fully applied version and never half-migrated.
 */
export async function migrate(db: SqlDatabase, migrations: Migration[] = MIGRATIONS): Promise<number> {
  await db.run(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`)

  const rows = await db.query<{ version: number }>('SELECT MAX(version) AS version FROM schema_migrations')
  const current = rows[0]?.version ?? 0
  const latest = migrations.reduce((max, m) => Math.max(max, m.version), 0)
  if (current > latest) throw new DatabaseTooNewError(current, latest)

  const pending = migrations.filter((m) => m.version > current).sort((a, b) => a.version - b.version)
  for (const m of pending) {
    await db.transaction(async (tx) => {
      for (const sql of m.statements) await tx.run(sql)
      await tx.run('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)', [
        m.version,
        m.name,
        new Date().toISOString(),
      ])
    })
  }
  return latest
}
