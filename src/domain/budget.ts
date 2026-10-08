import { addDays, dayOfWeek, type ISODate } from '@/utils/dates'
import type { Minor } from '@/utils/money'
import type { Period } from './periods'

export interface BudgetInput {
  period: Period
  today: ISODate
  /** Scheduled allowance plus any extra money received in the period. */
  income: Minor
  /** Money moved into savings during the period (allocation + manual deposits − withdrawals). */
  saved: Minor
  spentBeforeToday: Minor
  spentToday: Minor
  /** Days of week (0 = Sunday) that count as spending days. Empty means every day. */
  spendingDays: number[]
  /** Held back for planned expenses that aren't paid yet. Not spent, just not spendable. */
  reserved?: Minor
}

export type Pace = 'on_track' | 'fast' | 'over'

export interface BudgetSummary {
  income: Minor
  saved: Minor
  /** income − saved: what the student planned to live on this period. */
  available: Minor
  spent: Minor
  /** available − spent. Negative when over budget. */
  remaining: Minor
  /** Spending days from today to the end of the period, today included. */
  daysLeft: number
  totalDays: number
  spentToday: Minor
  /** available − spending before today: what the daily amount is worked out from. */
  leftThisMorning: Minor
  /** Held for planned expenses; taken out before the daily amount is worked out. */
  reserved: Minor
  /** remaining − reserved: what is free to spend for the rest of the period. */
  free: Minor
  /** What today was allowed to be, decided before today's spending. */
  dailyAllowance: Minor
  safeToSpendToday: Minor
  /** How far today's spending exceeded the daily allowance (0 when within it). */
  overToday: Minor
  /** Spending you would expect by the end of today if spending evenly. */
  expectedByToday: Minor
  pace: Pace
}

/**
 * Number of spending days in [from, to]. `today` always counts so the student
 * is never told they have zero days left while the period is still running.
 */
export function countSpendingDays(from: ISODate, to: ISODate, spendingDays: number[], today: ISODate): number {
  const days = new Set(spendingDays.length ? spendingDays : [0, 1, 2, 3, 4, 5, 6])
  let n = 0
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (d === today || days.has(dayOfWeek(d))) n++
  }
  return n
}

/** Below this share of the plan, running ahead of schedule is not worth mentioning. */
const PACE_TOLERANCE = 0.05

export function summarizeBudget(input: BudgetInput): BudgetSummary {
  const { period, today, income, saved, spentBeforeToday, spentToday, spendingDays } = input
  const reserved = Math.max(0, input.reserved ?? 0)
  const available = income - saved
  const spent = spentBeforeToday + spentToday
  const remaining = available - spent

  const totalDays = Math.max(1, countSpendingDays(period.start, period.end, spendingDays, today))
  const daysLeft = Math.max(1, countSpendingDays(today, period.end, spendingDays, today))
  const elapsed = Math.max(1, countSpendingDays(period.start, today, spendingDays, today))

  // Spread what was left this morning, less what's held for planned expenses, across the
  // remaining days, then subtract today.
  const leftThisMorning = available - spentBeforeToday
  const dailyAllowance = Math.max(0, Math.floor((leftThisMorning - reserved) / daysLeft))
  const safeToSpendToday = Math.max(0, dailyAllowance - spentToday)
  const overToday = Math.max(0, spentToday - dailyAllowance)

  const expectedByToday = Math.max(0, Math.round((available * elapsed) / totalDays))
  let pace: Pace = 'on_track'
  if (remaining < 0) pace = 'over'
  else if (spent - expectedByToday > Math.max(0, available) * PACE_TOLERANCE) pace = 'fast'

  return {
    income,
    saved,
    available,
    spent,
    remaining,
    spentToday,
    leftThisMorning,
    reserved,
    free: remaining - reserved,
    daysLeft,
    totalDays,
    dailyAllowance,
    safeToSpendToday,
    overToday,
    expectedByToday,
    pace,
  }
}
