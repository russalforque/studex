import { Capacitor } from '@capacitor/core'
import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite'
import type { RawDriver, RunResult, SqlValue } from './types'

const DB_NAME = 'studex'

/**
 * SQLite through @capacitor-community/sqlite.
 * - Android / iOS: native SQLite file in the app sandbox.
 * - Web (development in the browser): sql.js via the <jeep-sqlite> element,
 *   persisted to IndexedDB after each write.
 */
export async function openCapacitorDriver(): Promise<RawDriver> {
  const platform = Capacitor.getPlatform()
  const sqlite = new SQLiteConnection(CapacitorSQLite)

  if (platform === 'web') await setupWebStore(sqlite)

  await sqlite.checkConnectionsConsistency().catch(() => undefined)
  const existing = (await sqlite.isConnection(DB_NAME, false)).result
  const conn: SQLiteDBConnection = existing
    ? await sqlite.retrieveConnection(DB_NAME, false)
    : await sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false)
  await conn.open()
  await conn.execute('PRAGMA foreign_keys = ON;', false)

  let flushTimer: ReturnType<typeof setTimeout> | undefined
  const flush = () => {
    if (flushTimer) clearTimeout(flushTimer)
    flushTimer = undefined
    return sqlite.saveToStore(DB_NAME).catch((err) => console.error('Saving web database failed', err))
  }
  if (platform === 'web') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void flush()
    })
    window.addEventListener('pagehide', () => void flush())
  }

  return {
    async run(sql: string, params: SqlValue[]): Promise<RunResult> {
      const res = await conn.run(sql, params, false)
      return { changes: res.changes?.changes ?? 0 }
    },
    async query<T>(sql: string, params: SqlValue[]): Promise<T[]> {
      const res = await conn.query(sql, params)
      const values = (res.values ?? []) as Array<Record<string, unknown>>
      // On iOS the plugin prepends a row describing the column names.
      if (values.length > 0 && values[0] && 'ios_columns' in values[0]) values.shift()
      return values as T[]
    },
    async exec(sql: string): Promise<void> {
      await conn.execute(sql, false)
    },
    async close(): Promise<void> {
      if (platform === 'web') await flush()
      await sqlite.closeConnection(DB_NAME, false)
    },
    afterWrite:
      platform === 'web'
        ? () => {
            if (flushTimer) clearTimeout(flushTimer)
            flushTimer = setTimeout(() => void flush(), 250)
          }
        : undefined,
  }
}

async function setupWebStore(sqlite: SQLiteConnection): Promise<void> {
  const { defineCustomElements } = await import('jeep-sqlite/loader')
  await defineCustomElements(window)
  if (!document.querySelector('jeep-sqlite')) {
    const el = document.createElement('jeep-sqlite')
    // sql-wasm.wasm is served from /assets (copied from sql.js on install).
    el.setAttribute('wasmpath', 'assets')
    el.setAttribute('autosave', 'false')
    document.body.appendChild(el)
  }
  await customElements.whenDefined('jeep-sqlite')
  await sqlite.initWebStore()
}
