import type { ClassSlotView } from '@/types/models'
import { addDays, dayOfWeek, timeToMinutes, type ISODate, type TimeHM } from '@/utils/dates'

export function slotsForDay<T extends { dayOfWeek: number; startTime: TimeHM }>(slots: T[], day: number): T[] {
  return slots.filter((s) => s.dayOfWeek === day).sort((a, b) => a.startTime.localeCompare(b.startTime))
}

export interface NextClass {
  slot: ClassSlotView
  date: ISODate
  /** `now` while the class is in progress. */
  status: 'now' | 'next'
}

/** The class in progress, or the next one within the coming week. */
export function findNextClass(slots: ClassSlotView[], today: ISODate, time: TimeHM): NextClass | null {
  if (slots.length === 0) return null
  const minutes = timeToMinutes(time)
  const todays = slotsForDay(slots, dayOfWeek(today))
  const current = todays.find((s) => timeToMinutes(s.startTime) <= minutes && minutes < timeToMinutes(s.endTime))
  if (current) return { slot: current, date: today, status: 'now' }
  const laterToday = todays.find((s) => timeToMinutes(s.startTime) > minutes)
  if (laterToday) return { slot: laterToday, date: today, status: 'next' }
  for (let i = 1; i <= 7; i++) {
    const date = addDays(today, i)
    const first = slotsForDay(slots, dayOfWeek(date))[0]
    if (first) return { slot: first, date, status: 'next' }
  }
  return null
}

export type DayItem<T> = { type: 'class'; slot: T } | { type: 'gap'; minutes: number; from: TimeHM }

/** Classes in order, with the free time between them when it is at least `minGap` minutes. */
export function withFreeTime<T extends { startTime: TimeHM; endTime: TimeHM }>(
  daySlots: T[],
  minGap = 30,
): DayItem<T>[] {
  const items: DayItem<T>[] = []
  let lastEnd: TimeHM | null = null
  for (const slot of daySlots) {
    if (lastEnd) {
      const gap = timeToMinutes(slot.startTime) - timeToMinutes(lastEnd)
      if (gap >= minGap) items.push({ type: 'gap', minutes: gap, from: lastEnd })
    }
    items.push({ type: 'class', slot })
    if (!lastEnd || slot.endTime > lastEnd) lastEnd = slot.endTime
  }
  return items
}

type Timed = { dayOfWeek: number; startTime: TimeHM; endTime: TimeHM }

/** Slots on the same day whose times overlap — shown as a warning, never blocked. */
export function overlaps(a: Timed, b: Timed): boolean {
  return a.dayOfWeek === b.dayOfWeek && a.startTime < b.endTime && b.startTime < a.endTime
}

/** How many minutes two weekly slots share (0 when they don't overlap). */
export function overlapMinutes(a: Timed, b: Timed): number {
  if (!overlaps(a, b)) return 0
  const start = Math.max(timeToMinutes(a.startTime), timeToMinutes(b.startTime))
  const end = Math.min(timeToMinutes(a.endTime), timeToMinutes(b.endTime))
  return Math.max(0, end - start)
}

export interface Conflict<T> {
  a: T
  b: T
  minutes: number
}

/** Every pair of weekly slots that overlap, in day and time order. */
export function findConflicts<T extends Timed & { id: string }>(slots: T[]): Conflict<T>[] {
  const sorted = [...slots].sort((x, y) => x.dayOfWeek - y.dayOfWeek || x.startTime.localeCompare(y.startTime))
  const out: Conflict<T>[] = []
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i]!
      const b = sorted[j]!
      // Sorted by day then start, so once one slot starts after `a` ends, none later can overlap it.
      if (b.dayOfWeek !== a.dayOfWeek || b.startTime >= a.endTime) break
      out.push({ a, b, minutes: overlapMinutes(a, b) })
    }
  }
  return out
}

/** Clashes a proposed class (on each of `days`) would have with existing slots. */
export function conflictsFor<T extends Timed & { id: string }>(
  proposal: { id?: string; days: number[]; startTime: TimeHM; endTime: TimeHM },
  slots: T[],
): Array<{ slot: T; day: number; minutes: number }> {
  if (!proposal.startTime || !proposal.endTime || proposal.endTime <= proposal.startTime) return []
  const out: Array<{ slot: T; day: number; minutes: number }> = []
  for (const day of proposal.days) {
    const mine = { dayOfWeek: day, startTime: proposal.startTime, endTime: proposal.endTime }
    for (const s of slots) {
      if (s.id === proposal.id) continue
      const minutes = overlapMinutes(s, mine)
      if (minutes > 0) out.push({ slot: s, day, minutes })
    }
  }
  return out
}
