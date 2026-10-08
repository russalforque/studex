import { useQuery } from '@tanstack/react-query'
import { useClock, useRepos, useSettings } from '@/app/contexts'
import { endOfMonth, startOfMonth, startOfWeek, type ISODate } from '@/utils/dates'

/*
 * Read hooks. Components never touch SQL: they ask for data here and the
 * repositories do the work. Keys start with a QueryArea so writes can invalidate them.
 */

export function useCurrentSemester() {
  const repos = useRepos()
  return useQuery({ queryKey: ['semesters', 'current'], queryFn: () => repos.settings.currentSemester() })
}

export function useSemesters() {
  const repos = useRepos()
  return useQuery({ queryKey: ['semesters', 'all'], queryFn: () => repos.settings.listSemesters() })
}

export function useSubjects() {
  const repos = useRepos()
  const { currentSemesterId } = useSettings()
  return useQuery({
    queryKey: ['subjects', currentSemesterId],
    queryFn: () => (currentSemesterId ? repos.subjects.list(currentSemesterId) : Promise.resolve([])),
  })
}

export function useSubject(id: string) {
  const repos = useRepos()
  return useQuery({ queryKey: ['subjects', 'one', id], queryFn: () => repos.subjects.get(id) })
}

export function useSlots() {
  const repos = useRepos()
  const { currentSemesterId } = useSettings()
  return useQuery({
    queryKey: ['slots', currentSemesterId],
    queryFn: () => (currentSemesterId ? repos.subjects.listSlots(currentSemesterId) : Promise.resolve([])),
  })
}

export function useSubjectSlots(subjectId: string) {
  const repos = useRepos()
  return useQuery({ queryKey: ['slots', 'subject', subjectId], queryFn: () => repos.subjects.listSlotsForSubject(subjectId) })
}

export function useTasks() {
  const repos = useRepos()
  return useQuery({ queryKey: ['tasks'], queryFn: () => repos.tasks.list() })
}

export function useSubjectTasks(subjectId: string) {
  const repos = useRepos()
  return useQuery({ queryKey: ['tasks', 'subject', subjectId], queryFn: () => repos.tasks.listForSubject(subjectId) })
}

export function useExams() {
  const repos = useRepos()
  return useQuery({ queryKey: ['exams'], queryFn: () => repos.exams.list() })
}

export function useSubjectExams(subjectId: string) {
  const repos = useRepos()
  return useQuery({ queryKey: ['exams', 'subject', subjectId], queryFn: () => repos.exams.listForSubject(subjectId) })
}

export function useCategories() {
  const repos = useRepos()
  return useQuery({ queryKey: ['categories'], queryFn: () => repos.expenses.listCategories() })
}

export function useCurrentBudget() {
  const repos = useRepos()
  const { today } = useClock()
  const { spendingDays } = useSettings()
  return useQuery({
    queryKey: ['budget', today, spendingDays.join('')],
    queryFn: () => repos.allowance.currentBudget(today, spendingDays),
  })
}

export function useAllowancePlan() {
  const repos = useRepos()
  return useQuery({ queryKey: ['plan'], queryFn: () => repos.allowance.getPlan() })
}

export function useIncome() {
  const repos = useRepos()
  return useQuery({ queryKey: ['income'], queryFn: () => repos.allowance.listIncome(60) })
}

/** Today / this calendar week (Mon–Sun) / this calendar month. */
export function useSpendingTotals() {
  const repos = useRepos()
  const { today } = useClock()
  return useQuery({
    queryKey: ['expenses', 'totals', today],
    queryFn: async () => {
      const [day, week, month] = await Promise.all([
        repos.expenses.total(today, today),
        repos.expenses.total(startOfWeek(today), today),
        repos.expenses.total(startOfMonth(today), endOfMonth(today)),
      ])
      return { day, week, month }
    },
  })
}

export function useCategoryTotals(from: ISODate, to: ISODate) {
  const repos = useRepos()
  return useQuery({
    queryKey: ['expenses', 'byCategory', from, to],
    queryFn: () => repos.expenses.totalsByCategory(from, to),
  })
}

export function useRecentExpenses(limit = 5) {
  const repos = useRepos()
  return useQuery({ queryKey: ['expenses', 'recent', limit], queryFn: () => repos.expenses.recent(limit) })
}

export function useExpensesRange(from: ISODate, to: ISODate) {
  const repos = useRepos()
  return useQuery({ queryKey: ['expenses', 'range', from, to], queryFn: () => repos.expenses.listRange(from, to) })
}

export function useGoals() {
  const repos = useRepos()
  return useQuery({ queryKey: ['savings', 'goals'], queryFn: () => repos.savings.listGoals() })
}

export function useGoal(id: string) {
  const repos = useRepos()
  return useQuery({ queryKey: ['savings', 'goal', id], queryFn: () => repos.savings.getGoal(id) })
}

export function useGoalTransactions(id: string) {
  const repos = useRepos()
  return useQuery({ queryKey: ['savings', 'tx', id], queryFn: () => repos.savings.listTransactions(id) })
}
