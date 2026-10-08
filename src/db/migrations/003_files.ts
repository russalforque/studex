import type { Migration } from './index'

const NOW = `(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`

/**
 * Study materials. The files themselves live in the app's private storage
 * (`files/<id>.<ext>`); SQLite only keeps what is needed to list, find and link them.
 */
export const migration003: Migration = {
  version: 3,
  name: 'study files and attachments',
  statements: [
    // path: relative to the app's data folder, so it stays valid after a restore on another phone.
    // fingerprint: original size plus a hash of the file's first and last bytes, to spot the same
    // file imported twice (photos are re-encoded on import, so the stored size can differ).
    `CREATE TABLE files (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL CHECK (length(trim(name)) > 0),
      original_name TEXT,
      mime_type TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('image', 'pdf', 'doc', 'text')),
      size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
      path TEXT NOT NULL UNIQUE,
      thumb_path TEXT,
      fingerprint TEXT,
      subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT ${NOW},
      updated_at TEXT NOT NULL DEFAULT ${NOW}
    )`,
    `CREATE INDEX ix_files_subject ON files (subject_id, created_at)`,
    `CREATE INDEX ix_files_created ON files (created_at)`,
    `CREATE INDEX ix_files_fingerprint ON files (fingerprint)`,

    // One file can be attached to several tasks, exams and notes without being copied.
    // Targets live in different tables, so the repositories remove links when a target is deleted.
    `CREATE TABLE file_links (
      file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
      target_type TEXT NOT NULL CHECK (target_type IN ('task', 'exam', 'note')),
      target_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT ${NOW},
      PRIMARY KEY (file_id, target_type, target_id)
    )`,
    `CREATE INDEX ix_file_links_target ON file_links (target_type, target_id)`,
  ],
}
