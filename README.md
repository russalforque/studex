# Studex

A calm, offline-first companion for students: classes, tasks, exams, allowance, expenses and
savings in one app. Everything is stored on the device in SQLite. No account, no internet, no
backend.

Built with React 19, TypeScript, Vite, Tailwind CSS v4, Capacitor 8 and
`@capacitor-community/sqlite`. One codebase for Android and iOS.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the architecture, schema, navigation, flows
and the phase plan.

## Status

| Phase | Scope | Status |
|---|---|---|
| 1 — MVP | Onboarding, Home, Subjects, Tasks, Schedule, Exams, Allowance, Expenses, Budget, Savings goals, Settings, SQLite | Done |
| 2 | Grades, Attendance, Notes | Next |
| 3 | Budget analytics, backup / export / import | Planned |

## Getting started

Requirements: Node 20+. Android builds need Android Studio. iOS builds need macOS with Xcode.

```bash
npm install          # also copies the sql.js engine to public/assets for browser dev
npm run dev          # browser preview at http://localhost:5173 (data saved to IndexedDB)
```

The browser preview is for development. It runs the same SQLite code through sql.js, so it
behaves like the phone, including persistence across reloads.

### Checks

```bash
npm test             # domain logic + repository tests against real SQLite (sql.js)
npm run typecheck
npm run lint
npm run build        # typecheck + production bundle in dist/
```

### Run on a phone

```bash
npm run cap:android  # build, sync, open Android Studio → Run
npm run cap:ios      # build, sync, open Xcode → Run   (macOS only)
```

After changing web code, `npm run cap:sync` copies the new build into both native projects.

## Project layout

```
src/
  app/           App root, gates (database → onboarding → router), clock, back button
  pages/         Screens
  features/      Feature UI: form sheets and rows per area
  components/    Shared UI (Sheet, Button, fields, layout)
  hooks/         Data hooks (TanStack Query) and write helper
  repositories/  All SQL lives here
  domain/        Pure logic: budget, allowance periods, schedule, tasks, savings
  db/            Driver interface, serialized connection, migrations
  validation/    zod schemas shared by forms and repositories
```

## Data safety

- Schema changes go through numbered, append-only migrations, each in its own transaction.
  A database written by a newer app version is never opened or modified by an older one.
- Multi-step writes run in transactions; a failure rolls back the whole change.
- Deleting anything asks first and says what will happen. Subjects keep their tasks and exams;
  categories are archived, not deleted; past allowance periods are never rewritten.
- Re-submitting a form never creates a duplicate.

## Common issues

| Symptom | Fix |
|---|---|
| Browser preview stuck on loading, console shows `LinkError: WebAssembly.instantiate()` | The wasm in `public/assets` must match the sql.js build bundled in jeep-sqlite. Keep `sql.js` pinned at **1.12.0** and run `npm run copy:wasm`. |
| Native app shows old UI | Run `npm run cap:sync` after building. |
| `cap open ios` fails on Windows | iOS builds need macOS + Xcode. The `ios/` project is ready to open there. |
| Data missing after clearing site data in the browser | Browser preview data lives in IndexedDB; clearing it resets the preview. Phone data is separate. |

## Development notes

- React Compiler is enabled. Inside closures, avoid non-null assertions on optional props
  (`task!.id`): the compiler may read them during render. Use `task?.id ?? ''` instead.
- Money is stored as integer hundredths. Use `parseMoney` / `formatMoney` from `utils/money`.
- Dates are local `YYYY-MM-DD` strings; use helpers in `utils/dates` for arithmetic.
