import { DEFAULT_ATTENDANCE_RULES, type AttendanceRecord, type AttendanceRules, type AttendanceStatus, type ClassSlotView } from '@/types/models'
import { dayOfWeek, timeToMinutes, type ISODate, type TimeHM } from '@/utils/dates'
import { slotsForDay } from './schedule'

export interface AttendanceStats {
  present: number
  late: number
  absent: number
  excused: number
  /** Every class recorded, whatever its status. */
  total: number
  /** Classes that count toward the rate under the rules. */
  counted: number
  /** Credit for attended classes under the rules (a late arrival may count as half). */
  attended: number
  /** Whole-number percentage. Null with nothing that counts. */
  rate: number | null
  /** Unrounded, for comparing against a requirement. */
  exactRate: number | null
}

const LATE_CREDIT: Record<AttendanceRules['late'], number> = { present: 1, half: 0.5, absent: 0 }

/**
 * Attended out of every class that counts. By default late counts as attended and excused
 * classes are left out; both can be changed in Settings to match the school's policy.
 */
export function attendanceStats(
  records: Pick<AttendanceRecord, 'status'>[],
  rules: AttendanceRules = DEFAULT_ATTENDANCE_RULES,
): AttendanceStats {
  const s = { present: 0, late: 0, absent: 0, excused: 0 }
  for (const r of records) s[r.status] += 1
  const excusedCounts = rules.excused === 'present'
  const counted = s.present + s.late + s.absent + (excusedCounts ? s.excused : 0)
  const attended = s.present + s.late * LATE_CREDIT[rules.late] + (excusedCounts ? s.excused : 0)
  const exactRate = counted === 0 ? null : (attended / counted) * 100
  return {
    ...s,
    total: records.length,
    counted,
    attended,
    rate: exactRate === null ? null : Math.round(exactRate),
    exactRate,
  }
}

export type Standing =
  | { kind: 'none' }
  /** `canMiss`: absences in a row before dropping below the requirement. */
  | { kind: 'ok'; canMiss: number }
  | { kind: 'close'; canMiss: number }
  /** `toRecover`: classes in a row to attend to get back to the requirement (null if out of reach). */
  | { kind: 'below'; toRecover: number | null }

/**
 * Where the student stands against a required percentage. "Close" means one or two more
 * absences would drop them below it. Worked out only from classes recorded so far: Studex
 * doesn't know how many classes are left in the term.
 */
export function attendanceStanding(stats: AttendanceStats, required: number | null): Standing {
  if (required === null || stats.exactRate === null) return { kind: 'none' }
  const r = required / 100
  if (stats.exactRate + 1e-9 >= required) {
    // Largest k with attended / (counted + k) ≥ r.
    const canMiss = Math.max(0, Math.floor(stats.attended / r - stats.counted + 1e-9))
    return { kind: canMiss <= 1 ? 'close' : 'ok', canMiss }
  }
  // Smallest n with (attended + n) / (counted + n) ≥ r.
  if (r >= 1) return { kind: 'below', toRecover: null }
  const toRecover = Math.max(1, Math.ceil((r * stats.counted - stats.attended) / (1 - r) - 1e-9))
  return { kind: 'below', toRecover }
}

export function parseAttendanceRules(json: string | null): AttendanceRules {
  if (!json) return { ...DEFAULT_ATTENDANCE_RULES }
  try {
    const v = JSON.parse(json) as Partial<AttendanceRules>
    return {
      late: v.late === 'half' || v.late === 'absent' || v.late === 'present' ? v.late : DEFAULT_ATTENDANCE_RULES.late,
      excused: v.excused === 'present' || v.excused === 'skip' ? v.excused : DEFAULT_ATTENDANCE_RULES.excused,
    }
  } catch {
    return { ...DEFAULT_ATTENDANCE_RULES }
  }
}

/** How many of the most recent classes to look at before mentioning a pattern. */
const RECENT = 5

/**
 * A neutral heads-up when absences are piling up recently, or null.
 * `records` may be in any order.
 */
export function attendanceNote(records: Pick<AttendanceRecord, 'status' | 'date' | 'startTime'>[]): string | null {
  const recent = [...records]
    .filter((r) => r.status !== 'excused')
    .sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime))
    .slice(0, RECENT)
  const missed = recent.filter((r) => r.status === 'absent').length
  if (recent.length >= 3 && missed >= 2) return `You missed ${missed} of your last ${recent.length} classes.`
  return null
}

export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  present: 'Present',
  late: 'Late',
  absent: 'Absent',
  excused: 'Excused',
}

/**
 * The most recent class today that has already ended and isn't marked yet, so Home
 * can ask about it with one tap. Null when there is nothing to ask.
 */
export function classToMark(
  slots: ClassSlotView[],
  marked: Pick<AttendanceRecord, 'subjectId' | 'date' | 'startTime'>[],
  today: ISODate,
  time: TimeHM,
): ClassSlotView | null {
  const now = timeToMinutes(time)
  const done = new Set(marked.filter((m) => m.date === today).map((m) => `${m.subjectId}|${m.startTime}`))
  const ended = slotsForDay(slots, dayOfWeek(today)).filter((s) => timeToMinutes(s.endTime) <= now)
  for (let i = ended.length - 1; i >= 0; i--) {
    const s = ended[i]!
    if (!done.has(`${s.subjectId}|${s.startTime}`)) return s
  }
  return null
}
