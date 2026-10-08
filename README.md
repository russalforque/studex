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
| 2 — 0.2.0 | Terms (switch, archive, view past), backup / restore, CSV export, grades with targets, attendance, notes, exam study topics, profile photo, reminders, search, weekly summary, safe-to-spend explainer, tablet layouts | Done |
| 3 — 0.3.0 | Study files: import, camera, scanner (crop, rotate, multi-page PDF), Files page, attachments on subjects/tasks/exams/notes, offline viewer, storage check; backups include files | Done |
| Later | Budget analytics (period history, category trends) | Planned |

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

## Native features

| Feature | Plugin | Notes |
|---|---|---|
| Backup, CSV export | `@capacitor/filesystem`, `@capacitor/share` | Files go to the share sheet (Files, Drive, email). Restore uses a normal file picker. |
| Reminders | `@capacitor/local-notifications` | Opt-in. Scheduled on the device for the next 7 days, at most 60 pending (iOS allows 64). Android 13+ asks for permission. |
| Study files: camera, scanner | `@capacitor/camera` | Native camera on both platforms. No Android camera permission is declared (it uses the system camera app); iOS uses `NSCameraUsageDescription`. |
| Study files: import | none (system file picker) | The WebView's file input opens the native picker (multiple selection, no storage permission). |
| Study files: view | `pdfjs-dist` (bundled, lazy-loaded) | Images, PDFs and text open in the app offline. Word files go to another app via `@capacitor-community/file-opener`. |
| Backups with files | `fflate` (reading) + own zip writer | A standard .zip: `backup.json` plus `files/` and `thumbs/`, written and read in chunks. |
| Profile photo | none (file input) | Gallery or camera on both platforms; resized to 256px on the device and stored in SQLite. iOS usage strings are in `Info.plist`. |

## Data safety

- Schema changes go through numbered, append-only migrations, each in its own transaction.
  A database written by a newer app version is never opened or modified by an older one.
- Multi-step writes run in transactions; a failure rolls back the whole change.
- Deleting anything asks first and says what will happen. Subjects keep their tasks and exams;
  categories are archived, not deleted; past allowance periods are never rewritten.
- Re-submitting a form never creates a duplicate.
- Restoring a backup checks the file first, shows what it contains, asks before replacing anything, keeps a private
  copy of the current data, and runs in one transaction. A backup from a newer app version is refused.

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
