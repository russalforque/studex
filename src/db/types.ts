export type SqlValue = string | number | null

export interface RunResult {
  changes: number
}

/** Anything that can execute statements: the database itself or an open transaction. */
export interface SqlExecutor {
  run(sql: string, params?: SqlValue[]): Promise<RunResult>
  query<T = Record<string, unknown>>(sql: string, params?: SqlValue[]): Promise<T[]>
}

export interface SqlDatabase extends SqlExecutor {
  /**
   * Runs `fn` inside BEGIN/COMMIT. Any thrown error rolls the whole unit back.
   * Use the `tx` executor inside the callback — calling the outer database from
   * within a transaction would wait on the transaction itself.
   */
  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>
  close(): Promise<void>
}

/** The minimal surface a platform driver must provide. */
export interface RawDriver {
  run(sql: string, params: SqlValue[]): Promise<RunResult>
  query<T>(sql: string, params: SqlValue[]): Promise<T[]>
  exec(sql: string): Promise<void>
  close(): Promise<void>
  /** Called after any committed write. Used by the web driver to flush to IndexedDB. */
  afterWrite?(): void
}
