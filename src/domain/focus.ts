import type { SessionStatus } from '@/types/models'

/**
 * The running timer, saved after every change. Time is never counted by ticking: elapsed time is
 * worked out from wall-clock timestamps, so locking the phone, switching apps or the system
 * killing Studex can't make the timer drift. Reopening the app simply reads the clock again.
 */
export interface FocusState {
  /** Stable id of the session being timed, so recording it twice inserts it once. */
  sessionId: string
  phase: 'focus' | 'break'
  subjectId: string | null
  plannedSeconds: number
  /** When this phase was first started (epoch ms). */
  startedAt: number
  /** When the timer was last started or resumed; null while paused. */
  runningSince: number | null
  /** Time already run before `runningSince`. */
  elapsedBeforeMs: number
  /** Break length to offer after a focus block, or null for a single session. */
  breakSeconds: number | null
}

export const PRESET_MINUTES = [25, 45, 60] as const
export const MIN_MINUTES = 1
export const MAX_MINUTES = 240
/** Ending a session before this has passed discards it instead of recording an interruption. */
export const MIN_RECORD_SECONDS = 60

export function startFocus(opts: {
  sessionId: string
  subjectId: string | null
  minutes: number
  breakMinutes: number | null
  now: number
}): FocusState {
  const minutes = Math.round(opts.minutes)
  if (!(minutes >= MIN_MINUTES && minutes <= MAX_MINUTES)) {
    throw new Error(`Choose between ${MIN_MINUTES} and ${MAX_MINUTES} minutes`)
  }
  return {
    sessionId: opts.sessionId,
    phase: 'focus',
    subjectId: opts.subjectId,
    plannedSeconds: minutes * 60,
    startedAt: opts.now,
    runningSince: opts.now,
    elapsedBeforeMs: 0,
    breakSeconds: opts.breakMinutes ? Math.round(opts.breakMinutes) * 60 : null,
  }
}

export function startBreak(prev: FocusState, sessionId: string, now: number): FocusState {
  return {
    sessionId,
    phase: 'break',
    subjectId: prev.subjectId,
    plannedSeconds: prev.breakSeconds ?? 5 * 60,
    startedAt: now,
    runningSince: now,
    elapsedBeforeMs: 0,
    breakSeconds: prev.breakSeconds,
  }
}

/** Milliseconds run so far, never more than planned and never negative (e.g. the clock moved back). */
export function elapsedMs(s: FocusState, now: number): number {
  const running = s.runningSince === null ? 0 : Math.max(0, now - s.runningSince)
  return Math.min(s.plannedSeconds * 1000, Math.max(0, s.elapsedBeforeMs + running))
}

export function remainingMs(s: FocusState, now: number): number {
  return s.plannedSeconds * 1000 - elapsedMs(s, now)
}

export function isFinished(s: FocusState, now: number): boolean {
  return remainingMs(s, now) <= 0
}

/** When a running phase will end, for the notification. Null while paused. */
export function endsAt(s: FocusState): number | null {
  if (s.runningSince === null) return null
  return s.runningSince + (s.plannedSeconds * 1000 - s.elapsedBeforeMs)
}

export function pause(s: FocusState, now: number): FocusState {
  if (s.runningSince === null) return s
  return { ...s, runningSince: null, elapsedBeforeMs: elapsedMs(s, now) }
}

export function resume(s: FocusState, now: number): FocusState {
  if (s.runningSince !== null) return s
  return { ...s, runningSince: now }
}

export interface SessionRecord {
  id: string
  subjectId: string | null
  plannedSeconds: number
  focusedSeconds: number
  startedAt: string
  endedAt: string
  status: SessionStatus
}

/**
 * The study-history row for a focus phase that is ending, or null when there is nothing worth
 * keeping (a break, or a session ended within its first minute).
 * A finished session ends when its time ran out, not when the app noticed.
 */
export function sessionRecord(s: FocusState, now: number): SessionRecord | null {
  if (s.phase !== 'focus') return null
  const done = isFinished(s, now)
  const focusedSeconds = done ? s.plannedSeconds : Math.floor(elapsedMs(s, now) / 1000)
  if (!done && focusedSeconds < MIN_RECORD_SECONDS) return null
  const end = done ? (endsAt(s) ?? now) : now
  return {
    id: s.sessionId,
    subjectId: s.subjectId,
    plannedSeconds: s.plannedSeconds,
    focusedSeconds,
    startedAt: new Date(s.startedAt).toISOString(),
    endedAt: new Date(Math.max(end, s.startedAt)).toISOString(),
    status: done ? 'completed' : 'interrupted',
  }
}

/** "25:00", "1:05:00". */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const sec = total % 60
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  return `${h > 0 ? `${h}:` : ''}${mm.padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

/** Parses saved state, returning null for anything malformed rather than crashing the timer screen. */
export function parseFocusState(json: string | null): FocusState | null {
  if (!json) return null
  try {
    const v = JSON.parse(json) as Partial<FocusState>
    const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
    if (
      typeof v.sessionId !== 'string' ||
      (v.phase !== 'focus' && v.phase !== 'break') ||
      !num(v.plannedSeconds) ||
      v.plannedSeconds <= 0 ||
      !num(v.startedAt) ||
      !num(v.elapsedBeforeMs) ||
      !(v.runningSince === null || num(v.runningSince))
    ) {
      return null
    }
    return {
      sessionId: v.sessionId,
      phase: v.phase,
      subjectId: typeof v.subjectId === 'string' ? v.subjectId : null,
      plannedSeconds: v.plannedSeconds,
      startedAt: v.startedAt,
      runningSince: v.runningSince ?? null,
      elapsedBeforeMs: v.elapsedBeforeMs,
      breakSeconds: num(v.breakSeconds) ? v.breakSeconds : null,
    }
  } catch {
    return null
  }
}
