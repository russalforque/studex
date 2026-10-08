import type { Database } from 'sql.js'
import type { RawDriver, RunResult, SqlValue } from './types'

/** In-memory driver over sql.js. Used by the test suite to exercise real SQL. */
export function createSqlJsDriver(db: Database): RawDriver {
  db.exec('PRAGMA foreign_keys = ON;')
  return {
    async run(sql: string, params: SqlValue[]): Promise<RunResult> {
      db.run(sql, params)
      return { changes: db.getRowsModified() }
    },
    async query<T>(sql: string, params: SqlValue[]): Promise<T[]> {
      const stmt = db.prepare(sql)
      try {
        stmt.bind(params)
        const rows: T[] = []
        while (stmt.step()) rows.push(stmt.getAsObject() as T)
        return rows
      } finally {
        stmt.free()
      }
    },
    async exec(sql: string): Promise<void> {
      db.exec(sql)
    },
    async close(): Promise<void> {
      db.close()
    },
  }
}
