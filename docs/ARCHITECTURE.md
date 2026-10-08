# Studex architecture

Studex is an offline-first personal planner and budget app for students. It has no server, no
account and no network dependency. One React + TypeScript codebase runs on Android and iOS through
Capacitor, and stores everything in a local SQLite database.

## 1. Application architecture

```
┌──────────────────────────────────────────────────────────────┐
│ pages/            Screens (Home, Tasks, Schedule, Budget…)    │
│ features/         Feature UI: form sheets, rows, copy         │
│ components/       Reusable UI (Sheet, Button, fields, Row…)   │
├──────────────────────────────────────────────────────────────┤
│ hooks/            useQuery read hooks · useAction writes      │
│                   (TanStack Query cache, invalidated by area) │
├──────────────────────────────────────────────────────────────┤
│ repositories/     The only code that writes SQL               │
│ validation/       zod schemas shared by forms and repos       │
│ domain/           Pure business logic (budget, periods,       │
│                   schedule, tasks, savings) — unit tested     │
├──────────────────────────────────────────────────────────────┤
│ db/               Driver interface, serialized connection,    │
│                   migrations                                  │
│   capacitorDriver   @capacitor-community/sqlite (native)      │
│                     + jeep-sqlite/sql.js (browser dev)        │
│   sqljsDriver       in-memory sql.js (tests)                  │
└──────────────────────────────────────────────────────────────┘
```

Key decisions:

- **Repository layer.** Components never contain SQL. They call hooks, hooks call repositories,
  repositories take a `SqlDatabase`. The same repositories run against native SQLite in the app and
  against sql.js in tests, so the SQL is exercised by the test suite.
- **Serialized connection.** `SerializedDatabase` queues every statement and transaction on the
  single connection, so async code can never interleave two transactions.
- **Transactions** wrap every multi-statement write (onboarding, adding a class on several days,
  plan changes, deleting a subject, savings withdrawals with a balance check).
- **Money as integers.** All amounts are stored in hundredths (`*_minor` columns). No floats.
- **Derived, never stored.** Savings balances, budget totals and safe-to-spend are computed from
  rows on read, so they can't drift out of sync.
- **Idempotent creates.** Task, exam and expense forms generate their UUID when the form opens. A
  double-tapped Save hits the primary key and is treated as already saved.
- **Sync-ready.** UUID primary keys and `created_at`/`updated_at` on every table let a future
  backup/sync layer merge records without remapping ids. Nothing in the UI depends on there being
  no server.
- **Offline by construction.** TanStack Query runs with `networkMode: 'always'`, the Manrope font is
  bundled (no Google Fonts), and there are no network calls anywhere.

## 2. Folder structure

```
studex/
├─ capacitor.config.ts        appId com.studex.app, SystemBars/Keyboard/SQLite config
├─ android/  ios/             Generated native projects (Capacitor 8)
├─ public/assets/sql-wasm.wasm  sql.js engine for browser development only
├─ docs/ARCHITECTURE.md
└─ src/
   ├─ main.tsx                 Entry: platform init + <App/>
   ├─ index.css                Tailwind v4, design tokens, light/dark, safe areas
   ├─ app/                     App root, gates (DB → onboarding → router), clock, contexts,
   │                           Android back-button handling
   ├─ components/
   │  ├─ layout/               Page, AppShell, BottomNav, Fab
   │  └─ ui/                   Button, Sheet, fields, choice, display, Toast, ConfirmSheet,
   │                           CategoryIcon
   ├─ features/
   │  ├─ sheets/               SheetsProvider + Quick Add
   │  ├─ tasks/ exams/ schedule/ subjects/ budget/ savings/ settings/
   │  └─ shared/               Form building blocks (DateChooser, SubjectSelect…)
   ├─ pages/                   One file per screen
   ├─ hooks/                   data.ts (reads), useAction (writes), useForm, queryKeys
   ├─ services/                database bootstrap, platform (system bars, keyboard, splash),
   │                           back-handler stack
   ├─ db/                      types, SerializedDatabase, drivers, migrate, migrations/
   ├─ repositories/            settings, subjects (+ class schedule), tasks, exams, expenses
   │                           (+ categories), allowance (+ budget), savings
   ├─ domain/                  budget, periods, schedule, tasks, savings (+ tests)
   ├─ validation/              zod schemas
   ├─ types/                   Domain models
   └─ utils/                   dates, money, id, cn
```

## 3. SQLite schema (migration 001)

| Table | Purpose | Notes |
|---|---|---|
| `schema_migrations` | Applied migration versions | Refuses to open a DB from a newer app |
| `settings` | Single row (`id = 1`): name, school, currency, spending days, current term | `CHECK (id = 1)` |
| `semesters` | Terms | Current term is `settings.current_semester_id` |
| `subjects` | Name, code, instructor, room, colour, notes | FK → semesters `RESTRICT`; unique name per term (case-insensitive, partial index) |
| `class_schedules` | Weekly class times | FK → subjects `CASCADE`; `UNIQUE(subject, day, start)`; `CHECK end > start` |
| `tasks` | Title, kind, due date/time, priority, status | FK → subjects `SET NULL`; index `(status, due_date)` |
| `exams` | Exam/quiz/presentation/project, date, coverage, study status | FK → subjects `SET NULL`; index on date |
| `allowance_plans` | Amount, frequency, interval, anchor date, auto-savings | Only one active plan (partial unique index) |
| `allowances` | Money received: one `scheduled` row per period + `extra` rows | `UNIQUE(plan_id, period_start) WHERE kind='scheduled'` makes generation idempotent |
| `expense_categories` | 10 seeded defaults + custom | Archive instead of delete; unique active name |
| `expenses` | Amount, category, note, date | FK → categories `RESTRICT`; indexes on date and category |
| `savings_goals` | Name, target, target date | Balance derived from transactions |
| `savings_transactions` | Deposits/withdrawals, source `manual`/`allowance`/`initial` | FK → goals `RESTRICT`; unique `allowance_id` |

All ids are UUID text; timestamps are ISO-8601 UTC; dates `YYYY-MM-DD`; times `HH:MM`.

### Migration 002 (additive)

| Change | Purpose |
|---|---|
| `settings.course`, `year_level`, `avatar`, `reminder_prefs` | Profile details, a small JPEG data URL, reminder settings (JSON) |
| `semesters.archived_at` | Tidy old terms away; nothing inside them changes |
| `subjects.target_grade` | Percentage the student aims for |
| `notes` | Optional subject (`SET NULL`), pinned, indexed by `(pinned, updated_at)` |
| `attendance` | One row per class meeting: `UNIQUE(subject_id, date, start_time)`; deleted with the subject |
| `grade_items` | Score, total, weight; deleted with the subject |
| `exam_topics` | Study checklist; `CASCADE` with the exam |

Grade estimates are a weighted average of item percentages and are always labelled as estimates.
Attendance rate is (present + late) / (present + late + absent); excused classes don't count.

### Migration 003: study files

| Table | Purpose |
|---|---|
| `files` | Name, original name, MIME type, kind (image/pdf/doc/text), size, `path` relative to the app's data folder, thumbnail path, fingerprint, optional subject (`SET NULL`), description |
| `file_links` | File ↔ task/exam/note. One stored file can be attached to many records. `CASCADE` with the file; task/exam/note deletes remove their links in the same transaction |

The bytes live in the app's private storage (`files/<id>.<ext>`, thumbnails in `thumbs/`), never as
SQLite BLOBs. Imports write the bytes first and the row last; deletes remove the row first and the
bytes last. An interruption can therefore only leave an unreferenced file, which the check at
startup (and Files → Storage → Check now) removes. Rows whose file disappeared show as missing.

Imports copy the picked or captured data into app storage immediately, never relying on picker
or camera temporary paths. Camera photos and scans are re-encoded to at most 2560px, JPEG 85%;
picked files are stored exactly as they are (large JPEG photos excepted), so text in screenshots
and documents never loses sharpness. Duplicates are detected by original size plus a hash of the
first and last 256 KB.

### Migration 004: guide progress

| Table | Purpose |
|---|---|
| `guide_progress` | One row per guide: `tour` (the app tour) or `tip.<name>` (one-time feature tips). `version`, `status` (`started`/`completed`/`skipped`/`seen`) and `step` reached |

Device state, not the student's records: it is deliberately not in `BACKUP_TABLES`, so backups
don't carry it and a restore leaves it alone.

### Migration 005: focus, recurring and planned expenses, presets, attendance rules, grade categories

| Change | Purpose |
|---|---|
| `study_sessions` | Finished focus blocks: planned and focused seconds, start/end, `completed`/`interrupted`. Subject `SET NULL` |
| `focus_state` | Single row with the running timer (JSON). Device state, not in backups |
| `recurring_expenses` | Name, amount, category, frequency (as allowance plans), start/end date, `auto` or `confirm`, active |
| `recurring_occurrences` | PK `(recurring_id, occurrence_date)`: one row per due date once recorded or skipped; `expense_id` `SET NULL` |
| `planned_expenses` | Title, estimate, category, due date, subject/task `SET NULL`, `reserve`, `expense_id` (unique, `SET NULL`) once paid |
| `expense_presets` | Saved one-tap expenses |
| `subjects.attendance_required`, `settings.attendance_rules` | Required % per subject; how late/excused count (JSON) |
| `grade_categories` | Name + weight % per subject, total ≤ 100 (checked in the repository) |
| `grade_items` rebuilt | `score` nullable (not graded yet) and `category_id` `SET NULL`. Nothing references the table, so the rebuild is safe; rows are copied unchanged |

**Focus timer.** Elapsed time is computed from timestamps (`runningSince`, `elapsedBeforeMs`), never by counting ticks,
so locking the phone or the app being killed doesn't affect it. State is saved on every change. A session that ran out
while the app was closed is recorded on next open (`FocusSync`), keyed on its id so it can't be recorded twice. The
"time's up" notification uses id 9001; reminder re-planning only cancels ids 1–60.

**Recurring expenses.** Nothing runs in the background. On every start and day change, `reconcile(today)` walks each
automatic rule's due dates (up to 400 days back) and records the ones without an occurrence row, inside a transaction.
The occurrence row is the idempotency key: reconciling twice, deleting the generated expense, or restoring a backup never
records a date again. "Ask me first" rules list unhandled dates for Record (amount editable) or Skip. Resuming a paused
rule marks the paused dates as skipped.

**Planned expenses and Safe to spend.** Unpaid planned expenses with `reserve = 1` due by the end of the current budget
period (or undated) are *reserved*: subtracted before the daily amount is worked out, never counted as spending. Paying
one inserts the real expense and links it in one transaction, so the amount moves from reserved to spent — counted once.
A reserved expense paid today is counted with spending *before* today so it doesn't wipe out today's amount. Deleting
the expense (or Undo) makes the plan unpaid and reserved again.

```
daily       = floor((available − spent before today − reserved) / daysLeft)
```

**Grades.** With categories, each category's percentage is the weighted average of its graded items; the estimate
re-scales over categories with grades. Uncategorised items share the weight the categories leave over. "Needed" solves
`final(x) = a + b·x` for the same percentage `x` on every ungraded item.

**Attendance.** Rate = attended ÷ counted under the student's rules (late = present / half / absent; excused = not
counted / present). With a required %, the subject shows how many absences in a row keep it at or above the requirement,
or how many classes in a row bring it back.

**App lock** (optional, native only). A 4–8 digit PIN, stored only as a salted PBKDF2-SHA256 hash (210k iterations) in
`@aparajita/capacitor-secure-storage` (Keychain / Keystore), never in SQLite or backups. Optional biometrics via
`@aparajita/capacitor-biometric-auth`. Wrong tries back off (30 s → 15 min). The lock covers the app on launch and after
a minute in the background; `@capacitor-community/privacy-screen` hides content in the app switcher while it's on (and
blocks screenshots on Android). It is a privacy screen, not encryption, so a forgotten PIN can't be reset: the student
is told plainly that clearing app data (and restoring a backup) is the way back. A lock left in the iOS Keychain by an
earlier install is cleared before onboarding.

### Backup format

A zip archive: `backup.json` (`{ app: "studex", format: 1, schemaVersion, appVersion, exportedAt, tables }`,
every row of the data tables) followed by `files/` and `thumbs/` exactly as stored. Entries are
stored with their size and CRC in the local header (`services/archiveFormat.ts`), so the archive can be
read back as a stream without scanning for signatures, and it opens in any zip tool. Older JSON-only
backups still restore. Files are unpacked into `restore-staging/`, the database is replaced in one
transaction, then a commit marker is written and the staged folders replace the live ones. On launch
an unfinished swap is completed, or uncommitted staging is discarded. Restore deletes child-first and inserts parent-first in one transaction, only
using columns the current schema has, so older backups restore into newer apps.

### Budget model

For the allowance period that contains today:

```
income      = scheduled allowance + extra money received in the period
saved       = savings set aside from the allowance + manual deposits − manual withdrawals
available   = income − saved
spent       = expenses dated in the period
remaining   = available − spent
daysLeft    = spending days from today to period end (today always counts)
daily       = floor((available − spent before today) / daysLeft)
safe today  = max(0, daily − spent today)
```

Spending days default to every day; Settings can restrict them (e.g. school days only).
"Spending faster than planned" appears when spending runs more than 5% of the budget ahead of an
even pace. Money saved before using Studex (a goal's starting amount) never touches the budget.

When the allowance plan changes, only the current period is rewritten; earlier periods stay as
recorded. Missed periods (app not opened for a while) are back-filled once on the next launch.

## 4. Navigation

Bottom tabs: **Home · Tasks · Schedule · Budget · More**

```
Home ─────────── Quick Add (FAB) → Task / Expense / Class / Exam sheets
Tasks ────────── filters: Today · Upcoming · Overdue · Done, subject filter
Schedule ─────── Day plan (classes, timed tasks/exams, study sessions; Anytime list; any date) · Week (conflicts)
Budget ──────┬── Allowance (plan, this period breakdown, received money)
             ├── School expenses (planned, set aside, paid) · Recurring expenses (waiting for you)
             ├── All expenses (by month)
             └── Savings goals
More ────────┬── Subjects (?term= for past terms) → Subject detail
             │     (grades + target, attendance, class times, tasks, exams, notes)
             ├── Grades & attendance (term overview)
             ├── Exams & quizzes (upcoming / past, study topics: rename, reorder)
             ├── Focus (timer, today, study history) · Your week (any week)
             ├── Notes (pinned, recently edited, search)
             ├── Savings goals → Goal detail (add / withdraw / history)
             └── Settings (profile + photo, terms → Terms, reminders, currency,
                           spending days, categories, backup / restore / CSV)
Search ───────── from Home and More: subjects, tasks, exams, notes, files

Tablets (≥ 768px): the tab bar becomes a left rail and sheets open as centred dialogs.
At ≥ 1024px Home and Budget use two columns and Subjects shows list | detail.
```

Every create/edit form is a bottom sheet hosted by `SheetsProvider`, openable from any screen.
Android's back button closes the open sheet first, then navigates back, then returns to Home,
and only exits from Home.

### Phone and tablet layouts

One codebase and one set of components; layouts adapt at three tiers (no separate tablet pages):

| Tier | When | Layout |
|---|---|---|
| Phone | portrait phones | Single column, floating bottom nav, bottom sheets, Quick Add FAB |
| Rail (`rail:` variant) | ≥ 768px, or landscape ≥ 600px | Navigation rail on the left, wider reading column, sheets become centred dialogs; compact rail when height ≤ 520px (`short:`) |
| Wide (`useMediaQuery(WIDE)`) | ≥ 1024px | Two columns where it helps: Home, Budget, Allowance, Goal detail (`Columns`); master-detail for Tasks (list · details) and Subjects (list · subject); Schedule (day · week) and Exams (upcoming · past) drop their toggles; Savings and Notes become grids |

The `rail` variant must use the block form of `@custom-variant`: the one-line form keeps only the
first query of a comma-separated media list.

### Light and dark theme

Settings → Appearance offers System / Light / Dark. The choice is a device preference kept in
localStorage (`studex.theme`), not in SQLite, so it applies before the database opens: an inline
script in `index.html` sets `<html data-theme>` before first paint, then `services/theme.ts` keeps it
in sync (device changes when on System, status bar icon colour, `theme-color`). Colour tokens and
Tailwind's `dark:` variant key off `data-theme`, never `prefers-color-scheme` directly.

### App tour and feature tips

`features/guide/`. After setup, `TourProvider` offers the tour once (Start tour / Maybe later). The
tour walks the real screens: each step in `tourSteps.ts` names a route and one or more `data-tour`
targets in order of preference. `TourOverlay` dims the page, spotlights the first target with room
for its card beside it (`placement.ts`, unit tested), and follows it every frame through loading,
scrolling, rotation and backgrounding. A step whose targets never appear still shows its card. The
page under the overlay can't be tapped, so the tour can't create or change anything; Android back
and Escape skip it.

To add a step, tag the control with `data-tour="name"`, add the step with `since: <new version>` and
bump `TOUR_VERSION`. Students who already took the tour are offered only the new steps ("New in
Studex"), never the whole tour again. `GuideTip` shows a one-line hint the first time a form is
used (allowance, expense, subject, goal, add file). Settings → Help & guide replays the tour, runs
single-step feature guides and brings tips back.

## 5. Screens

Onboarding (3 steps) · Home · Tasks · Schedule · Budget · Allowance · All expenses · More ·
Subjects · Subject detail · Exams · Savings goals · Goal detail · Settings — plus sheets for
Quick Add, Task, Expense, Class, Exam, Subject, Allowance, Extra money, Savings goal,
Add/withdraw savings, Profile, Term, Category, and confirmation sheets for every delete.

## 6. Core user flows

1. **First launch** → name → term (skippable) → currency + allowance (skippable) → Home.
2. **Log an expense** → FAB → Expense → amount (numeric keypad, autofocus) → tap category → Add.
   Budget, safe-to-spend and Home update immediately.
3. **Plan the day** → Home shows next class, today's tasks and exams, upcoming week, budget.
   Tick a task's circle to complete it.
4. **Set up classes** → Add class → pick or create subject → tap days (MWF) → times → Add.
   Overlaps are flagged but allowed.
5. **Prepare for an exam** → Exams → add with date and coverage → tap the status pill to move it
   Not started → Studying → Ready → Done.
6. **Save toward a goal** → Savings → create goal (optional starting amount) → Add money /
   Withdraw (withdrawals can't exceed the balance). Optional automatic allocation from each
   allowance.
7. **New term** → Settings → Start a new term; old subjects are kept, not deleted.

## 7. Implementation phases

| Phase | Scope | Status |
|---|---|---|
| 1 — MVP | Onboarding, Home, Subjects, Tasks, Schedule, Exams, Allowance, Expenses, Budget overview, Savings goals, Settings, SQLite persistence, Android + iOS projects | **Done** |
| 2 | Migration 002; grades, attendance, notes, exam topics, terms, profile photo, backup / restore / CSV, reminders, search, weekly summary, tablet layouts | **Done** |
| 3 | Migration 005: focus timer, recurring and planned expenses, presets, attendance rules, grade categories and targets, day planner, conflict review, weekly summary page, reminder timing, app lock | **Done** |
| 4 | Budget analytics (period history, category trends) | Planned |
