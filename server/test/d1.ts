import { readFileSync } from 'node:fs'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'

/**
 * Just enough of the D1 API over node:sqlite for tests: prepare/bind/first/all/run and batch
 * (atomic, like D1). Runs the real migration, so constraints and SQL are exercised as in prod.
 */
class Statement {
  constructor(
    readonly db: DatabaseSync,
    readonly sql: string,
    readonly params: SQLInputValue[] = [],
  ) {}
  bind(...params: unknown[]) {
    return new Statement(this.db, this.sql, params.map((p) => (p === undefined ? null : (p as SQLInputValue))))
  }
  async first<T>(col?: string): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...this.params) as Record<string, unknown> | undefined
    if (!row) return null
    return (col ? row[col] : { ...row }) as T
  }
  async all<T>() {
    return { results: this.db.prepare(this.sql).all(...this.params).map((r) => ({ ...r })) as T[], success: true, meta: {} }
  }
  async run() {
    return this.exec()
  }
  exec() {
    const stmt = this.db.prepare(this.sql)
    if (/\bRETURNING\b/i.test(this.sql)) {
      const rows = stmt.all(...this.params)
      return { success: true, results: rows, meta: { changes: rows.length } }
    }
    const r = stmt.run(...this.params)
    return { success: true, results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }
  }
}

export function createD1(): D1Database {
  const db = new DatabaseSync(':memory:')
  db.exec(readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8'))
  const d1 = {
    prepare: (sql: string) => new Statement(db, sql),
    batch: async (stmts: Statement[]) => {
      db.exec('BEGIN')
      try {
        const out = stmts.map((s) => s.exec())
        db.exec('COMMIT')
        return out
      } catch (err) {
        db.exec('ROLLBACK')
        throw err
      }
    },
    exec: async (sql: string) => {
      db.exec(sql)
      return { count: 0, duration: 0 }
    },
    raw: db,
  }
  return d1 as unknown as D1Database
}
