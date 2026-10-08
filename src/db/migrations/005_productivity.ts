import type { Migration } from './index'

const NOW = `(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`

/**
 * Focus sessions, recurring and planned expenses, presets, attendance rules and grade
 * categories. Additive except for `grade_items`, which is rebuilt so a score can be left
 * empty for work that isn't graded yet. Nothing references `grade_items`, so the rebuild
 * can't break a foreign key, and every existing row is copied across unchanged.
 */
export const migration005: Migration = {
  version: 5,
  name: 'focus, recurring and planned expenses, presets, attendance rules, grade categories',
  statements: [
    // ---- Focus ----

    // One row per finished focus block. Planned length and what was actually focused are both
    // kept, so an interrupted session still counts for the time it ran.
    `CREATE TABLE study_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
      planned_seconds INTEGER NOT NULL CHECK (planned_seconds > 0),
      focused_seconds INTEGER NOT NULL CHECK (focused_seconds >= 0),
      started_at TEXT NOT NULL,
      ended_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('completed', 'interrupted')),
      created_at TEXT NOT NULL DEFAULT ${NOW},
      updated_at TEXT NOT NULL DEFAULT ${NOW},
      CHECK (ended_at >= started_at)
    )`,
    `CREATE INDEX ix_study_sessions_started ON study_sessions (started_at)`,
    `CREATE INDEX ix_study_sessions_subject ON study_sessions (subject_id, started_at)`,

    // The running timer, if any. Device state rather than a record: kept out of backups.
    `CREATE TABLE focus_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      state TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT ${NOW}
    )`,

    // ---- Recurring expenses ----

    `CREATE TABLE recurring_expenses (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL CHECK (length(trim(name)) > 0),
      amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
      category_id TEXT NOT NULL REFERENCES expense_categories(id) ON DELETE RESTRICT,
      frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'biweekly', 'monthly', 'custom')),
      interval_days INTEGER CHECK (interval_days IS NULL OR interval_days BETWEEN 1 AND 366),
      start_date TEXT NOT NULL,
      end_date TEXT,
      mode TEXT NOT NULL DEFAULT 'confirm' CHECK (mode IN ('auto', 'confirm')),
      is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT ${NOW},
      updated_at TEXT NOT NULL DEFAULT ${NOW},
      CHECK (frequency <> 'custom' OR interval_days IS NOT NULL),
      CHECK (end_date IS NULL OR end_date >= start_date)
    )`,

    // One row per due date once it has been dealt with (recorded or skipped). The primary key
    // is the occurrence's stable identity, so reconciling twice can never record it twice, and
    // deleting the expense afterwards doesn't bring the occurrence back.
    `CREATE TABLE recurring_occurrences (
      recurring_id TEXT NOT NULL REFERENCES recurring_expenses(id) ON DELETE CASCADE,
      occurrence_date TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('recorded', 'skipped')),
      expense_id TEXT REFERENCES expenses(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT ${NOW},
      PRIMARY KEY (recurring_id, occurrence_date)
    )`,
    `CREATE UNIQUE INDEX ux_recurring_occurrences_expense
      ON recurring_occurrences (expense_id) WHERE expense_id IS NOT NULL`,

    // ---- Planned school expenses ----

    // Paid once `expense_id` points at the real expense. Deleting that expense makes the plan
    // unpaid again, so the money is never counted twice and never silently lost.
    `CREATE TABLE planned_expenses (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL CHECK (length(trim(title)) > 0),
      amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
      category_id TEXT NOT NULL REFERENCES expense_categories(id) ON DELETE RESTRICT,
      due_date TEXT,
      subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
      task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
      reserve INTEGER NOT NULL DEFAULT 1 CHECK (reserve IN (0, 1)),
      note TEXT,
      expense_id TEXT REFERENCES expenses(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT ${NOW},
      updated_at TEXT NOT NULL DEFAULT ${NOW}
    )`,
    `CREATE INDEX ix_planned_expenses_due ON planned_expenses (expense_id, due_date)`,
    `CREATE UNIQUE INDEX ux_planned_expenses_expense ON planned_expenses (expense_id) WHERE expense_id IS NOT NULL`,

    // ---- Expense presets ----

    `CREATE TABLE expense_presets (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL CHECK (length(trim(name)) > 0),
      amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
      category_id TEXT NOT NULL REFERENCES expense_categories(id) ON DELETE RESTRICT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT ${NOW},
      updated_at TEXT NOT NULL DEFAULT ${NOW}
    )`,

    // ---- Attendance ----

    // Percentage the school requires, if any.
    `ALTER TABLE subjects ADD COLUMN attendance_required REAL
      CHECK (attendance_required IS NULL OR (attendance_required > 0 AND attendance_required <= 100))`,
    // JSON: how late and excused classes count. Null means the defaults.
    `ALTER TABLE settings ADD COLUMN attendance_rules TEXT`,

    // ---- Grades ----

    `CREATE TABLE grade_categories (
      id TEXT PRIMARY KEY NOT NULL,
      subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      name TEXT NOT NULL CHECK (length(trim(name)) > 0),
      weight REAL NOT NULL CHECK (weight > 0 AND weight <= 100),
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT ${NOW},
      updated_at TEXT NOT NULL DEFAULT ${NOW}
    )`,
    `CREATE UNIQUE INDEX ux_grade_categories_name ON grade_categories (subject_id, name COLLATE NOCASE)`,

    `CREATE TABLE grade_items_new (
      id TEXT PRIMARY KEY NOT NULL,
      subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      category_id TEXT REFERENCES grade_categories(id) ON DELETE SET NULL,
      title TEXT NOT NULL CHECK (length(trim(title)) > 0),
      score REAL CHECK (score IS NULL OR score >= 0),
      max_score REAL NOT NULL CHECK (max_score > 0),
      weight REAL NOT NULL DEFAULT 1 CHECK (weight > 0),
      graded_on TEXT,
      created_at TEXT NOT NULL DEFAULT ${NOW},
      updated_at TEXT NOT NULL DEFAULT ${NOW}
    )`,
    `INSERT INTO grade_items_new (id, subject_id, category_id, title, score, max_score, weight, graded_on, created_at, updated_at)
      SELECT id, subject_id, NULL, title, score, max_score, weight, graded_on, created_at, updated_at FROM grade_items`,
    `DROP TABLE grade_items`,
    `ALTER TABLE grade_items_new RENAME TO grade_items`,
    `CREATE INDEX ix_grade_items_subject ON grade_items (subject_id, graded_on)`,
    `CREATE INDEX ix_grade_items_category ON grade_items (category_id)`,
  ],
}
