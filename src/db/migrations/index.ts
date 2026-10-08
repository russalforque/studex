import { migration001 } from './001_initial'
import { migration002 } from './002_academics'
import { migration003 } from './003_files'
import { migration004 } from './004_guides'
import { migration005 } from './005_productivity'

export interface Migration {
  version: number
  name: string
  statements: string[]
}

/**
 * Append-only. Never edit a migration that has shipped; add a new one instead.
 */
export const MIGRATIONS: Migration[] = [migration001, migration002, migration003, migration004, migration005]

export const SCHEMA_VERSION = MIGRATIONS.reduce((max, m) => Math.max(max, m.version), 0)
