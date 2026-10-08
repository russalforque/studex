import type { RawDriver, RunResult, SqlDatabase, SqlExecutor, SqlValue } from './types'

/**
 * Wraps a platform driver so every operation runs one at a time.
 *
 * A single SQLite connection is shared by the whole app and JavaScript is async,
 * so without this queue a read could observe a half-finished transaction, or two
 * transactions could interleave their statements on the same connection.
 */
export class SerializedDatabase implements SqlDatabase {
  private queue: Promise<unknown> = Promise.resolve()
  private readonly driver: RawDriver

  constructor(driver: RawDriver) {
    this.driver = driver
  }

  private enqueue<T>(op: () => Promise<T>): Promise<T> {
    const result = this.queue.then(op, op)
    // Keep the chain alive even when an operation fails.
    this.queue = result.catch(() => undefined)
    return result
  }

  run(sql: string, params: SqlValue[] = []): Promise<RunResult> {
    return this.enqueue(async () => {
      const res = await this.driver.run(sql, params)
      this.driver.afterWrite?.()
      return res
    })
  }

  query<T = Record<string, unknown>>(sql: string, params: SqlValue[] = []): Promise<T[]> {
    return this.enqueue(() => this.driver.query<T>(sql, params))
  }

  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
    return this.enqueue(async () => {
      let open = true
      const tx: SqlExecutor = {
        run: (sql, params = []) => {
          if (!open) throw new Error('Transaction already finished')
          return this.driver.run(sql, params)
        },
        query: <R,>(sql: string, params: SqlValue[] = []) => {
          if (!open) throw new Error('Transaction already finished')
          return this.driver.query<R>(sql, params)
        },
      }
      await this.driver.exec('BEGIN IMMEDIATE')
      try {
        const value = await fn(tx)
        await this.driver.exec('COMMIT')
        open = false
        this.driver.afterWrite?.()
        return value
      } catch (err) {
        open = false
        try {
          await this.driver.exec('ROLLBACK')
        } catch {
          // The original error is the one worth reporting.
        }
        throw err
      }
    })
  }

  close(): Promise<void> {
    return this.enqueue(() => this.driver.close())
  }
}
