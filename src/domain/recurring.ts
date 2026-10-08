import type { Frequency } from '@/types/models'
import { addDays, type ISODate } from '@/utils/dates'
import { nextPeriod, periodContaining, type PeriodRule } from './periods'

export interface RecurrenceRule {
  frequency: Frequency
  intervalDays: number | null
  startDate: ISODate
  endDate: ISODate | null
}

/** How far back a reconcile looks. Older missed dates (over a year) are left alone. */
export const LOOKBACK_DAYS = 400
const MAX_OCCURRENCES = 500

const periodRule = (r: RecurrenceRule): PeriodRule => ({
  frequency: r.frequency,
  anchorDate: r.startDate,
  intervalDays: r.intervalDays,
})

/**
 * Every due date of `rule` within [from, to], oldest first. Due dates are derived from the start
 * date (the same rules as allowance periods, so "the 31st" becomes the 30th or 28th in short
 * months), which gives each occurrence a stable identity: its date.
 */
export function occurrencesBetween(rule: RecurrenceRule, from: ISODate, to: ISODate): ISODate[] {
  const start = from > rule.startDate ? from : rule.startDate
  const end = rule.endDate && rule.endDate < to ? rule.endDate : to
  const out: ISODate[] = []
  if (start > end) return out
  const pr = periodRule(rule)
  let p = periodContaining(pr, start)
  while (p.start <= end && out.length < MAX_OCCURRENCES) {
    if (p.start >= start) out.push(p.start)
    p = nextPeriod(pr, p)
  }
  return out
}

/** The first due date after `after`, or null when the rule has ended. */
export function nextOccurrence(rule: RecurrenceRule, after: ISODate): ISODate | null {
  const from = addDays(after, 1)
  const start = from > rule.startDate ? from : rule.startDate
  const pr = periodRule(rule)
  let p = periodContaining(pr, start)
  if (p.start < start) p = nextPeriod(pr, p)
  if (rule.endDate && p.start > rule.endDate) return null
  return p.start
}

/** Due dates up to today that haven't been recorded or skipped yet. */
export function unhandledOccurrences(rule: RecurrenceRule, today: ISODate, handled: Set<ISODate>): ISODate[] {
  return occurrencesBetween(rule, addDays(today, -LOOKBACK_DAYS), today).filter((d) => !handled.has(d))
}

export function frequencyLabel(frequency: Frequency, intervalDays: number | null): string {
  switch (frequency) {
    case 'daily':
      return 'Every day'
    case 'weekly':
      return 'Every week'
    case 'biweekly':
      return 'Every 2 weeks'
    case 'monthly':
      return 'Every month'
    case 'custom':
      return intervalDays === 1 ? 'Every day' : `Every ${intervalDays} days`
  }
}
