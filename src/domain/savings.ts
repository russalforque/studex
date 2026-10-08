import { daysBetween, type ISODate } from '@/utils/dates'
import type { Minor } from '@/utils/money'

export interface SavingsTxLike {
  kind: 'deposit' | 'withdrawal'
  amount: Minor
}

export function savingsBalance(txs: SavingsTxLike[]): Minor {
  return txs.reduce((sum, t) => sum + (t.kind === 'deposit' ? t.amount : -t.amount), 0)
}

/** Whole-number percentage, capped to 0–100. */
export function progressPercent(balance: Minor, target: Minor): number {
  if (target <= 0) return 0
  return Math.min(100, Math.max(0, Math.floor((balance / target) * 100)))
}

/**
 * Roughly how much to put aside each month to reach the target on time.
 * Null when there is no target date, the goal is reached, or the date has passed.
 */
export function monthlyNeeded(balance: Minor, target: Minor, targetDate: ISODate | null, today: ISODate): Minor | null {
  if (!targetDate || balance >= target) return null
  const days = daysBetween(today, targetDate)
  if (days <= 0) return null
  const months = Math.max(1, Math.round(days / 30.4375))
  return Math.ceil((target - balance) / months / 100) * 100
}
