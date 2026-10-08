import type { Frequency } from '@/types/models'
import { addDays, addMonthsClamped, daysBetween, dayOfWeek, type ISODate } from '@/utils/dates'

export interface PeriodRule {
  frequency: Frequency
  anchorDate: ISODate
  intervalDays?: number | null
}

export interface Period {
  start: ISODate
  /** Inclusive. */
  end: ISODate
}

export function periodLengthDays(rule: PeriodRule): number | null {
  switch (rule.frequency) {
    case 'daily':
      return 1
    case 'weekly':
      return 7
    case 'biweekly':
      return 14
    case 'custom': {
      const n = rule.intervalDays ?? 0
      if (!Number.isInteger(n) || n < 1) throw new Error('Custom allowance needs an interval of at least 1 day')
      return n
    }
    case 'monthly':
      return null
  }
}

/** The allowance period that contains `date`. Works for dates before the anchor too. */
export function periodContaining(rule: PeriodRule, date: ISODate): Period {
  const len = periodLengthDays(rule)
  if (len !== null) {
    const k = Math.floor(daysBetween(rule.anchorDate, date) / len)
    const start = addDays(rule.anchorDate, k * len)
    return { start, end: addDays(start, len - 1) }
  }
  const [ay, am] = rule.anchorDate.split('-').map(Number)
  const [y, m] = date.split('-').map(Number)
  let k = (y! - ay!) * 12 + (m! - am!)
  if (addMonthsClamped(rule.anchorDate, k) > date) k -= 1
  const start = addMonthsClamped(rule.anchorDate, k)
  return { start, end: addDays(addMonthsClamped(rule.anchorDate, k + 1), -1) }
}

export function nextPeriod(rule: PeriodRule, period: Period): Period {
  return periodContaining(rule, addDays(period.end, 1))
}

/** Every period from the one containing `from` through the one containing `to`. */
export function periodsBetween(rule: PeriodRule, from: ISODate, to: ISODate, max = 1000): Period[] {
  const out: Period[] = []
  if (from > to) return out
  let p = periodContaining(rule, from)
  while (p.start <= to && out.length < max) {
    out.push(p)
    p = nextPeriod(rule, p)
  }
  return out
}

/**
 * The anchor for a new plan so that the current period starts on the student's
 * allowance day: the most recent `weekday` on or before `today` for weekly plans,
 * the most recent `dayOfMonth` for monthly plans, and `today` otherwise.
 */
export function anchorFor(
  frequency: Frequency,
  today: ISODate,
  opts: { weekday?: number; dayOfMonth?: number; startDate?: ISODate } = {},
): ISODate {
  switch (frequency) {
    case 'weekly':
    case 'biweekly': {
      const weekday = opts.weekday ?? 1
      return addDays(today, -((dayOfWeek(today) - weekday + 7) % 7))
    }
    case 'monthly': {
      const dom = Math.min(Math.max(opts.dayOfMonth ?? 1, 1), 31)
      // Anchor in the month two years ago so clamping (e.g. 31st) is driven by the rule, not today.
      const base = `${Number(today.slice(0, 4)) - 2}-01-${String(dom).padStart(2, '0')}`
      return periodContaining({ frequency: 'monthly', anchorDate: base }, today).start
    }
    case 'custom':
      return opts.startDate ?? today
    case 'daily':
      return today
  }
}

export function periodNoun(frequency: Frequency): string {
  switch (frequency) {
    case 'daily':
      return 'today'
    case 'weekly':
      return 'this week'
    case 'monthly':
      return 'this month'
    default:
      return 'this period'
  }
}
