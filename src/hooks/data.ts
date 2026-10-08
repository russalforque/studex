import { useQuery } from '@tanstack/react-query'
import { useClock, useRepos, useSettings } from '@/app/contexts'
import type { FileQuery } from '@/repositories/fileRepository'
import type { LinkTargetType } from '@/types/models'
import { addDays, endOfMonth, parseISODate, startOfMonth, startOfWeek, type ISODate } from '@/utils/dates'

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

/** Subjects of any term, e.g. a previous one viewed from Terms. */
export function useTermSubjects(semesterId: string) {
  const repos = useRepos()
  return useQuery({ queryKey: ['subjects', 'term', semesterId], queryFn: () => repos.subjects.list(semesterId) })
}

export function useTermSlots(semesterId: string) {
  const repos = useRepos()
  return useQuery({ queryKey: ['slots', 'term', semesterId], queryFn: () => repos.subjects.listSlots(semesterId) })
}

export function useSemester(id: string) {
  const repos = useRepos()
  return useQuery({ queryKey: ['semesters', 'one', id], queryFn: () => repos.settings.getSemester(id) })
}

export function useNotes(subjectId?: string) {
  const repos = useRepos()
  return useQuery({ queryKey: ['notes', subjectId ?? 'all'], queryFn: () => repos.notes.list(subjectId) })
}

export function useExamTopics(examId: string) {
  const repos = useRepos()
  return useQuery({ queryKey: ['topics', examId], queryFn: () => repos.exams.listTopics(examId) })
}

export function useSubjectAttendance(subjectId: string) {
  const repos = useRepos()
  return useQuery({ queryKey: ['attendance', 'subject', subjectId], queryFn: () => repos.academics.attendanceForSubject(subjectId) })
}

export function useAttendanceToday() {
  const repos = useRepos()
  const { today } = useClock()
  return useQuery({ queryKey: ['attendance', 'day', today], queryFn: () => repos.academics.attendanceOn(today) })
}

export function useTermAttendance() {
  const repos = useRepos()
  const { currentSemesterId } = useSettings()
  return useQuery({
    queryKey: ['attendance', 'term', currentSemesterId],
    queryFn: () => (currentSemesterId ? repos.academics.attendanceForSemester(currentSemesterId) : Promise.resolve([])),
  })
}

export function useSubjectGrades(subjectId: string) {
  const repos = useRepos()
  return useQuery({ queryKey: ['grades', 'subject', subjectId], queryFn: () => repos.academics.gradesForSubject(subjectId) })
}

export function useTermGrades() {
  const repos = useRepos()
  const { currentSemesterId } = useSettings()
  return useQuery({
    queryKey: ['grades', 'term', currentSemesterId],
    queryFn: () => (currentSemesterId ? repos.academics.gradesForSemester(currentSemesterId) : Promise.resolve([])),
  })
}

export function useSearch(query: string) {
  const repos = useRepos()
  const { currentSemesterId } = useSettings()
  const q = query.trim()
  return useQuery({
    queryKey: ['insights', 'search', currentSemesterId, q],
    queryFn: () => repos.insights.search(q, currentSemesterId),
    enabled: q.length >= 2,
    placeholderData: (prev) => prev,
  })
}

/** Totals for the Monday–Sunday week starting `weekStart` (this week by default). */
export function useWeekSummary(weekStart?: ISODate) {
  const repos = useRepos()
  const { today } = useClock()
  const start = weekStart ?? startOfWeek(today)
  return useQuery({ queryKey: ['insights', 'week', start, today], queryFn: () => repos.insights.weekSummary(start, today) })
}

export function useFocusState() {
  const repos = useRepos()
  return useQuery({ queryKey: ['focus', 'state'], queryFn: () => repos.focus.getState() })
}

/** Study sessions started on the local dates [from, to]. */
export function useStudySessions(from: ISODate, to: ISODate) {
  const repos = useRepos()
  return useQuery({
    queryKey: ['focus', 'sessions', from, to],
    queryFn: () => repos.focus.sessionsBetween(parseISODate(from).toISOString(), parseISODate(addDays(to, 1)).toISOString()),
  })
}

export function useRecentSessions(limit = 20) {
  const repos = useRepos()
  return useQuery({ queryKey: ['focus', 'recent', limit], queryFn: () => repos.focus.recent(limit) })
}

export function useRecurring() {
  const repos = useRepos()
  return useQuery({ queryKey: ['recurring', 'list'], queryFn: () => repos.recurring.list() })
}

export function usePendingRecurring() {
  const repos = useRepos()
  const { today } = useClock()
  return useQuery({ queryKey: ['recurring', 'pending', today], queryFn: () => repos.recurring.pending(today) })
}

export function useLastRecorded() {
  const repos = useRepos()
  return useQuery({ queryKey: ['recurring', 'last'], queryFn: () => repos.recurring.lastRecorded() })
}

export function usePlanned() {
  const repos = useRepos()
  const { today } = useClock()
  return useQuery({ queryKey: ['planned', today], queryFn: () => repos.planned.list(today) })
}

export function usePresets() {
  const repos = useRepos()
  return useQuery({ queryKey: ['presets'], queryFn: () => repos.expenses.listPresets() })
}

export function useGradeCategories(subjectId: string) {
  const repos = useRepos()
  return useQuery({ queryKey: ['grades', 'categories', subjectId], queryFn: () => repos.academics.categoriesForSubject(subjectId) })
}

export function useTermGradeCategories() {
  const repos = useRepos()
  const { currentSemesterId } = useSettings()
  return useQuery({
    queryKey: ['grades', 'categories', 'term', currentSemesterId],
    queryFn: () => (currentSemesterId ? repos.academics.categoriesForSemester(currentSemesterId) : Promise.resolve([])),
  })
}

/** Expenses worth repeating, from the last two months. */
export function useExpenseTemplates() {
  const repos = useRepos()
  const { today } = useClock()
  return useQuery({ queryKey: ['expenses', 'templates', today], queryFn: () => repos.expenses.templates(addDays(today, -60)) })
}

export function useFiles(q: FileQuery, enabled = true) {
  const repos = useRepos()
  return useQuery({
    queryKey: ['files', 'list', q],
    queryFn: () => repos.files.list(q),
    enabled,
    placeholderData: (prev) => prev,
  })
}

export function useFile(id: string | null) {
  const repos = useRepos()
  return useQuery({ queryKey: ['files', 'one', id], queryFn: () => repos.files.get(id ?? ''), enabled: !!id })
}

export function useFileLinks(id: string) {
  const repos = useRepos()
  return useQuery({ queryKey: ['files', 'links', id], queryFn: () => repos.files.links(id) })
}

export function useAttachedFiles(type: LinkTargetType, targetId: string) {
  const repos = useRepos()
  return useQuery({ queryKey: ['files', 'attached', type, targetId], queryFn: () => repos.files.attachedTo(type, targetId) })
}

export function useSubjectFiles(subjectId: string) {
  const repos = useRepos()
  return useQuery({ queryKey: ['files', 'subject', subjectId], queryFn: () => repos.files.forSubject(subjectId) })
}

export function useFileCounts() {
  const repos = useRepos()
  return useQuery({ queryKey: ['files', 'counts'], queryFn: () => repos.files.countsBySubject() })
}

export function useFileStorage() {
  const repos = useRepos()
  return useQuery({ queryKey: ['files', 'storage'], queryFn: () => repos.files.storage() })
}

export function useGuides() {
  const repos = useRepos()
  return useQuery({ queryKey: ['guides'], queryFn: () => repos.guides.list() })
}
