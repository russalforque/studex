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

/** Anything that changes money touches all of these. */
export const MONEY: QueryArea[] = ['expenses', 'budget', 'income', 'plan', 'savings']
