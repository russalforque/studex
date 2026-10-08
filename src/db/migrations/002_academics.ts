import type { Migration } from './index'

const NOW = `(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`

/**
 * Academic records, profile details and reminders. Additive only: every existing
 * row keeps its data, new columns are nullable or have defaults.
 */
export const migration002: Migration = {
  version: 2,
  name: 'notes, attendance, grades, exam topics, profile',
  statements: [
    `ALTER TABLE settings ADD COLUMN course TEXT`,
    `ALTER TABLE settings ADD COLUMN year_level TEXT`,
    // A small JPEG data URL (≤ 256px). Kept in the database so backups include it.
    `ALTER TABLE settings ADD COLUMN avatar TEXT`,
    // JSON reminder preferences; null means reminders were never turned on.
    `ALTER TABLE settings ADD COLUMN reminder_prefs TEXT`,

    `ALTER TABLE semesters ADD COLUMN archived_at TEXT`,

    // Percentage 0–100 the student is aiming for. An estimate, never an official grade.
    `ALTER TABLE subjects ADD COLUMN target_grade REAL CHECK (target_grade IS NULL OR (target_grade > 0 AND target_grade <= 100))`,

    `CREATE TABLE notes (
      id TEXT PRIMARY KEY NOT NULL,
      subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
      title TEXT,
      body TEXT NOT NULL DEFAULT '',
      pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT ${NOW},
      updated_at TEXT NOT NULL DEFAULT ${NOW},
      CHECK (length(trim(coalesce(title, '') || body)) > 0)
    )`,
    `CREATE INDEX ix_notes_pinned_updated ON notes (pinned, updated_at)`,
    `CREATE INDEX ix_notes_subject ON notes (subject_id)`,

    // One row per class meeting. `start_time` is '' when the student marks a day without a class time.
    `CREATE TABLE attendance (
      id TEXT PRIMARY KEY NOT NULL,
      subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      start_time TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK (status IN ('present', 'late', 'absent', 'excused')),
      created_at TEXT NOT NULL DEFAULT ${NOW},
      updated_at TEXT NOT NULL DEFAULT ${NOW},
      UNIQUE (subject_id, date, start_time)
    )`,
    `CREATE INDEX ix_attendance_date ON attendance (date)`,

    `CREATE TABLE grade_items (
      id TEXT PRIMARY KEY NOT NULL,
      subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      title TEXT NOT NULL CHECK (length(trim(title)) > 0),
      score REAL NOT NULL CHECK (score >= 0),
      max_score REAL NOT NULL CHECK (max_score > 0),
      weight REAL NOT NULL DEFAULT 1 CHECK (weight > 0),
      graded_on TEXT,
      created_at TEXT NOT NULL DEFAULT ${NOW},
      updated_at TEXT NOT NULL DEFAULT ${NOW}
    )`,
    `CREATE INDEX ix_grade_items_subject ON grade_items (subject_id, graded_on)`,

    `CREATE TABLE exam_topics (
      id TEXT PRIMARY KEY NOT NULL,
      exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
      title TEXT NOT NULL CHECK (length(trim(title)) > 0),
      done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT ${NOW},
      updated_at TEXT NOT NULL DEFAULT ${NOW}
    )`,
    `CREATE INDEX ix_exam_topics_exam ON exam_topics (exam_id, sort_order)`,

    // Search and "recent repeat" lookups.
    `CREATE INDEX ix_tasks_due ON tasks (due_date)`,
  ],
}
