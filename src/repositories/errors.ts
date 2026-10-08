/** A user-facing failure: the message is safe to show as-is. */
export class AppError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AppError'
  }
}

export class NotFoundError extends AppError {
  constructor(what: string) {
    super(`${what} could not be found. It may have been deleted.`)
    this.name = 'NotFoundError'
  }
}

/**
 * Turn low-level SQLite errors into messages a student can act on.
 * `duplicate` is shown when a UNIQUE constraint fails.
 */
export function friendlyDbError(err: unknown, duplicate = 'That already exists.'): Error {
  if (err instanceof AppError) return err
  const msg = err instanceof Error ? err.message : String(err)
  if (/UNIQUE constraint failed/i.test(msg)) return new AppError(duplicate)
  if (/FOREIGN KEY constraint failed/i.test(msg)) {
    return new AppError('This item is still used elsewhere, so it was not changed.')
  }
  if (/CHECK constraint failed/i.test(msg)) return new AppError('Some of the values are not valid.')
  return err instanceof Error ? err : new Error(msg)
}

export function errorMessage(err: unknown): string {
  if (err instanceof AppError) return err.message
  if (err instanceof Error && err.message) return err.message
  return 'Something went wrong. Please try again.'
}
