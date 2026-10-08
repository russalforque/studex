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
- **Offline by construction.** TanStack Query runs with `networkMode: 'always'`, the Inter font is
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

Planned migration 002 (next phase): `grade_categories`, `grades`, `attendance`, `notes`.

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
Schedule ─────── Day (rolling 7-day strip, free time between classes) · Week
Budget ──────┬── Allowance (plan, this period breakdown, received money)
             ├── All expenses (by month)
             └── Savings goals
More ────────┬── Subjects → Subject detail (class times, tasks, exams, notes)
             ├── Exams & quizzes (upcoming / past, one-tap study status)
             ├── Savings goals → Goal detail (add / withdraw / history)
             └── Settings (profile, term, currency, spending days, categories)
```

Every create/edit form is a bottom sheet hosted by `SheetsProvider`, openable from any screen.
Android's back button closes the open sheet first, then navigates back, then returns to Home,
and only exits from Home.

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
| 2 | Grades (weighted estimates, clearly labelled), Attendance (fast per-class entry, stats), Notes (per subject, pinned, search) — migration 002 | Next |
| 3 | Budget analytics (period history, category trends), local backup/export/import (JSON file via share sheet) | Planned |
| 4 | Reminders (local notifications for classes, due tasks, exams), optional cloud backup | Later |
