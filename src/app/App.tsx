import { useEffect, useState } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router'
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query'
import { AppShell } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/Button'
import { ErrorNotice, Loading } from '@/components/ui/display'
import { ToastProvider } from '@/components/ui/Toast'
import { TourProvider } from '@/features/guide/TourProvider'
import { SheetsProvider } from '@/features/sheets/SheetsProvider'
import { MONEY } from '@/hooks/queryKeys'
import { AcademicsPage } from '@/pages/AcademicsPage'
import { AllowancePage } from '@/pages/AllowancePage'
import { BudgetPage } from '@/pages/BudgetPage'
import { ExamsPage } from '@/pages/ExamsPage'
import { ExpenseHistoryPage } from '@/pages/ExpenseHistoryPage'
import { FocusPage } from '@/pages/FocusPage'
import { FilesPage } from '@/pages/FilesPage'
import { GoalDetailPage } from '@/pages/GoalDetailPage'
import { HelpPage } from '@/pages/HelpPage'
import { HomePage } from '@/pages/HomePage'
import { LicensePage } from '@/pages/LicensePage'
import { MorePage } from '@/pages/MorePage'
import { NotesPage } from '@/pages/NotesPage'
import { OnboardingPage } from '@/pages/OnboardingPage'
import { PlannedPage } from '@/pages/PlannedPage'
import { RecurringPage } from '@/pages/RecurringPage'
import { SavingsPage } from '@/pages/SavingsPage'
import { SchedulePage } from '@/pages/SchedulePage'
import { SearchPage } from '@/pages/SearchPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { SubjectDetailPage } from '@/pages/SubjectDetailPage'
import { SubjectsPage } from '@/pages/SubjectsPage'
import { TasksPage } from '@/pages/TasksPage'
import { TermsPage } from '@/pages/TermsPage'
import { WeekPage } from '@/pages/WeekPage'
import { FocusSync } from '@/features/focus/FocusSync'
import { LicenseGate } from '@/features/license/LicenseGate'
import { AppLockGate } from '@/features/lock/AppLock'
import { clearStaleLock } from '@/features/lock/lockContext'
import { DatabaseTooNewError } from '@/db/migrate'
import type { Repositories } from '@/repositories'
import { openDatabase } from '@/services/database'
import { hideSplash } from '@/services/platform'
import { ClockProvider } from './ClockProvider'
import { RepositoriesContext, SettingsContext, useClock, useRepos } from './contexts'
import { FileMaintenance } from './FileMaintenance'
import { NativeBackHandler } from './NativeBackHandler'
import { ReminderSync } from './ReminderSync'

const queryClient = new QueryClient({
  defaultOptions: {
    // Data is local: never pause for "offline", never refetch on focus, and only
    // refresh when a write invalidates it.
    queries: { networkMode: 'always', staleTime: Infinity, refetchOnWindowFocus: false, retry: 1 },
    mutations: { networkMode: 'always' },
  },
})

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ClockProvider>
          <LicenseGate>
            <DatabaseGate />
          </LicenseGate>
        </ClockProvider>
      </ToastProvider>
    </QueryClientProvider>
  )
}

type DbState = { status: 'loading' } | { status: 'ready'; repos: Repositories } | { status: 'error'; error: unknown }

function DatabaseGate() {
  const [state, setState] = useState<DbState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    openDatabase()
      .then((repos) => !cancelled && setState({ status: 'ready', repos }))
      .catch((error: unknown) => {
        console.error('Opening the database failed', error)
        if (!cancelled) setState({ status: 'error', error })
      })
      .finally(() => void hideSplash())
    return () => {
      cancelled = true
    }
  }, [attempt])

  if (state.status === 'loading') return <Loading label="Opening Studex" />
  if (state.status === 'error') {
    const tooNew = state.error instanceof DatabaseTooNewError
    return (
      <div className="pt-safe px-safe mx-auto flex min-h-dvh max-w-lg flex-col justify-center">
        <ErrorNotice
          message={
            tooNew
              ? (state.error as Error).message
              : "Studex couldn't open its data on this device. Nothing has been deleted. Close and reopen the app, or try again."
          }
        />
        {!tooNew && (
          <Button
            variant="secondary"
            className="mx-auto"
            onClick={() => {
              setState({ status: 'loading' })
              setAttempt((a) => a + 1)
            }}
          >
            Try again
          </Button>
        )}
      </div>
    )
  }
  return (
    <RepositoriesContext.Provider value={state.repos}>
      <SettingsGate />
    </RepositoriesContext.Provider>
  )
}

/** First launch goes to onboarding; afterwards settings are available to every screen. */
function SettingsGate() {
  const repos = useRepos()
  const { data: settings, isPending, error, refetch } = useQuery({
    queryKey: ['settings'],
    queryFn: () => repos.settings.get(),
  })

  if (isPending) return <Loading />
  if (error) return <ErrorNotice message="Your settings couldn't be loaded." onRetry={() => void refetch()} />
  if (!settings?.onboardedAt) return <FreshInstall />

  return (
    <SettingsContext.Provider value={settings}>
      <AppLockGate>
        <AllowanceSync />
        <FileMaintenance />
        <HashRouter>
          <NativeBackHandler />
          <ReminderSync />
          <FocusSync />
          <SheetsProvider>
            <TourProvider>
              <Routes>
                <Route element={<AppShell />}>
                  <Route index element={<HomePage />} />
                  <Route path="tasks" element={<TasksPage />} />
                  <Route path="schedule" element={<SchedulePage />} />
                  <Route path="budget" element={<BudgetPage />} />
                  <Route path="budget/allowance" element={<AllowancePage />} />
                  <Route path="budget/history" element={<ExpenseHistoryPage />} />
                  <Route path="budget/planned" element={<PlannedPage />} />
                  <Route path="budget/recurring" element={<RecurringPage />} />
                  <Route path="focus" element={<FocusPage />} />
                  <Route path="week" element={<WeekPage />} />
                  <Route path="more" element={<MorePage />} />
                  <Route path="subjects" element={<SubjectsPage />} />
                  <Route path="subjects/:id" element={<SubjectDetailPage />} />
                  <Route path="exams" element={<ExamsPage />} />
                  <Route path="savings" element={<SavingsPage />} />
                  <Route path="savings/:id" element={<GoalDetailPage />} />
                  <Route path="settings" element={<SettingsPage />} />
                  <Route path="terms" element={<TermsPage />} />
                  <Route path="notes" element={<NotesPage />} />
                  <Route path="files" element={<FilesPage />} />
                  <Route path="grades" element={<AcademicsPage />} />
                  <Route path="search" element={<SearchPage />} />
                  <Route path="help" element={<HelpPage />} />
                  <Route path="license" element={<LicensePage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
              </Routes>
            </TourProvider>
          </SheetsProvider>
        </HashRouter>
      </AppLockGate>
    </SettingsContext.Provider>
  )
}

/**
 * Records each new allowance period and every automatic recurring expense that has come due,
 * as the days go by. Nothing runs while the app is closed, so on each start (and day change)
 * everything missed since is caught up. Both steps are idempotent, so this is safe to repeat.
 */
function AllowanceSync() {
  const repos = useRepos()
  const client = useQueryClient()
  const { today } = useClock()
  useEffect(() => {
    const refresh = () => [...MONEY, 'insights'].forEach((area) => void client.invalidateQueries({ queryKey: [area] }))
    repos.allowance
      .ensureScheduled(today)
      .then((created) => created > 0 && refresh())
      .catch((err) => console.error('Recording allowance periods failed', err))
    repos.recurring
      .reconcile(today)
      .then((recorded) => recorded > 0 && refresh())
      .catch((err) => console.error('Recording recurring expenses failed', err))
  }, [repos, client, today])
  return null
}

/**
 * Before onboarding there is nothing to protect. iOS keeps Keychain items after an app is
 * deleted, so a lock from an earlier install is cleared here rather than locking a fresh start.
 */
function FreshInstall() {
  useEffect(() => {
    void clearStaleLock().catch(() => undefined)
  }, [])
  return <OnboardingPage />
}
