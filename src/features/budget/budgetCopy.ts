import type { BudgetSummary } from '@/domain/budget'
import { periodNoun } from '@/domain/periods'
import type { Frequency } from '@/types/models'
import { formatMoney } from '@/utils/money'

/** Friendly, non-judgmental status line for the current budget, or null when all is well. */
export function paceMessage(s: BudgetSummary, frequency: Frequency, currency: string): { text: string; tone: 'warn' | 'neutral' } | null {
  const noun = periodNoun(frequency)
  if (s.pace === 'over') {
    return { text: `You're ${formatMoney(-s.remaining, currency)} over your budget ${noun}.`, tone: 'warn' }
  }
  if (s.pace === 'fast') {
    return { text: `You're spending a little faster than planned ${noun}.`, tone: 'warn' }
  }
  if (s.overToday > 0) {
    return { text: `You've used today's amount. Extra spending comes out of the days ahead.`, tone: 'neutral' }
  }
  return null
}
