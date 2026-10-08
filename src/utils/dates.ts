/**
 * Calendar dates are stored as local `YYYY-MM-DD` strings and times as `HH:MM`.
 * Day arithmetic goes through UTC so daylight-saving shifts never skip or repeat a day.
 */
export type ISODate = string
export type TimeHM = string

const pad = (n: number) => String(n).padStart(2, '0')

export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function parseISODate(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y!, m! - 1, d!)
}

function toUTCDays(iso: ISODate): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Math.floor(Date.UTC(y!, m! - 1, d!) / 86_400_000)
}

function fromUTCDays(days: number): ISODate {
  const d = new Date(days * 86_400_000)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

export function todayISO(now: Date = new Date()): ISODate {
  return toISODate(now)
}

export function addDays(iso: ISODate, days: number): ISODate {
  return fromUTCDays(toUTCDays(iso) + days)
}

/** Whole days from `a` to `b` (positive when b is later). */
export function daysBetween(a: ISODate, b: ISODate): number {
  return toUTCDays(b) - toUTCDays(a)
}

/** 0 = Sunday … 6 = Saturday, matching Date#getDay. */
export function dayOfWeek(iso: ISODate): number {
  return (((toUTCDays(iso) + 4) % 7) + 7) % 7 // 1970-01-01 was a Thursday
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
}

/**
 * Same day-of-month as `anchor`, `months` later, clamped to the month's length
 * (Jan 31 + 1 month = Feb 28/29). Always computed from the anchor, never chained.
 */
export function addMonthsClamped(anchor: ISODate, months: number): ISODate {
  const [y, m, d] = anchor.split('-').map(Number)
  const total = y! * 12 + (m! - 1) + months
  const year = Math.floor(total / 12)
  const month = total - year * 12
  const day = Math.min(d!, daysInMonth(year, month))
  return `${year}-${pad(month + 1)}-${pad(day)}`
}

export function startOfWeek(iso: ISODate, weekStartsOn = 1): ISODate {
  const diff = (dayOfWeek(iso) - weekStartsOn + 7) % 7
  return addDays(iso, -diff)
}

export function startOfMonth(iso: ISODate): ISODate {
  return `${iso.slice(0, 7)}-01`
}

export function endOfMonth(iso: ISODate): ISODate {
  const [y, m] = iso.split('-').map(Number)
  return `${iso.slice(0, 7)}-${pad(daysInMonth(y!, m! - 1))}`
}

export function nowTime(now: Date = new Date()): TimeHM {
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`
}

export function timeToMinutes(t: TimeHM): number {
  const [h, m] = t.split(':').map(Number)
  return h! * 60 + m!
}

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })

export function formatTime(t: TimeHM): string {
  const [h, m] = t.split(':').map(Number)
  return timeFmt.format(new Date(2000, 0, 1, h, m))
}

export function formatTimeRange(start: TimeHM, end: TimeHM): string {
  return `${formatTime(start)} – ${formatTime(end)}`
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
export const WEEKDAYS_LONG = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const
/** Monday-first order used throughout the UI. */
export const WEEK_ORDER: readonly number[] = [1, 2, 3, 4, 5, 6, 0]

export function formatDate(iso: ISODate, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(undefined, opts).format(parseISODate(iso))
}

export function formatLongDate(iso: ISODate): string {
  return formatDate(iso, { weekday: 'long', month: 'long', day: 'numeric' })
}

export function formatShortDate(iso: ISODate, today: ISODate = todayISO()): string {
  const sameYear = iso.slice(0, 4) === today.slice(0, 4)
  return formatDate(
    iso,
    sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' },
  )
}

/** "Today", "Tomorrow", "Yesterday", a weekday within the next 6 days, otherwise "Oct 12". */
export function relativeDay(iso: ISODate, today: ISODate = todayISO()): string {
  const diff = daysBetween(today, iso)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  if (diff > 1 && diff < 7) return WEEKDAYS_LONG[dayOfWeek(iso)]!
  return formatShortDate(iso, today)
}

/** Compact weekday summary such as "MWF", "TTh" or "Mon". */
export function weekdaySummary(days: number[]): string {
  const sorted = [...new Set(days)].sort((a, b) => WEEK_ORDER.indexOf(a) - WEEK_ORDER.indexOf(b))
  const letters: Record<number, string> = { 1: 'M', 2: 'T', 3: 'W', 4: 'Th', 5: 'F', 6: 'Sa', 0: 'Su' }
  if (sorted.length > 1) return sorted.map((d) => letters[d]).join('')
  return sorted.map((d) => WEEKDAYS_SHORT[d]).join(', ')
}

export function greeting(now: Date = new Date()): string {
  const h = now.getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}
