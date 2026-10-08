import { migration001 } from './001_initial'

export interface Migration {
  version: number
  name: string
  statements: string[]
}

/**
 * Append-only. Never edit a migration that has shipped; add a new one instead.
 * Planned next: 002 adds grade_categories, grades, attendance and notes.
 */
export const MIGRATIONS: Migration[] = [migration001]
