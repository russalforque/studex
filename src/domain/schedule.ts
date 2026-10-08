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

/** Slots on the same day whose times overlap — shown as a warning, never blocked. */
export function overlaps(
  a: { dayOfWeek: number; startTime: TimeHM; endTime: TimeHM },
  b: { dayOfWeek: number; startTime: TimeHM; endTime: TimeHM },
): boolean {
  return a.dayOfWeek === b.dayOfWeek && a.startTime < b.endTime && b.startTime < a.endTime
}
