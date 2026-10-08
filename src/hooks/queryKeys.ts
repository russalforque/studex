/**
 * Top-level query key segments. Writes invalidate whole areas, which keeps the
 * cache rules simple: everything showing that kind of data refetches.
 */
export type QueryArea =
  | 'settings'
  | 'semesters'
  | 'subjects'
  | 'slots'
  | 'tasks'
  | 'exams'
  | 'categories'
  | 'expenses'
  | 'budget'
  | 'income'
  | 'plan'
  | 'savings'
  | 'notes'
  | 'attendance'
  | 'grades'
  | 'topics'
  | 'files'
  | 'guides'
  | 'focus'
  | 'recurring'
  | 'planned'
  | 'presets'
  /** Cross-area reads (search, weekly summary). Every write refreshes them. */
  | 'insights'

/** Anything that changes money touches all of these. */
export const MONEY: QueryArea[] = ['expenses', 'budget', 'income', 'plan', 'savings', 'recurring', 'planned']
