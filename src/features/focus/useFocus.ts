import { useCallback, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useRepos, useSettings } from '@/app/contexts'
import { useToast } from '@/components/ui/Toast'
import { endsAt, isFinished, pause, resume, startBreak, startFocus, type FocusState } from '@/domain/focus'
import { useFocusState } from '@/hooks/data'
import { errorMessage } from '@/repositories/errors'
import { cancelFocusAlert, requestReminderPermission, scheduleFocusAlert } from '@/services/reminders'
import type { SessionStatus } from '@/types/models'
import { uuid } from '@/utils/id'

/** Ticks while a phase is running so the clock on screen moves. Accuracy comes from timestamps, not this. */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const tick = () => setNow(Date.now())
    tick()
    const id = setInterval(tick, 1000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [active])
  return now
}

export interface Finished {
  status: SessionStatus | null
  /** The focus block that just ended, for offering its break. */
  state: FocusState
}

/**
 * Everything the Focus screen does to the timer. Each change is saved before anything else, so
 * closing the app at any moment loses nothing, and the "time's up" notification is rescheduled
 * to match.
 */
export function useFocus() {
  const repos = useRepos()
  const client = useQueryClient()
  const toast = useToast()
  const { reminders } = useSettings()
  const { data: state = null, isPending } = useFocusState()
  const running = !!state && state.runningSince !== null
  const now = useNow(running)
  const [finished, setFinished] = useState<Finished | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(
    () => Promise.all(['focus', 'insights'].map((area) => client.invalidateQueries({ queryKey: [area] }))),
    [client],
  )

  const alert = useCallback(
    async (s: FocusState | null) => {
      try {
        const at = s ? endsAt(s) : null
        if (!at || !reminders.focus) return await cancelFocusAlert()
        await scheduleFocusAlert(
          new Date(at),
          s!.phase === 'focus' ? 'Focus session complete' : 'Break is over',
          s!.phase === 'focus' ? 'Nice work. Take a break or start another session.' : 'Ready for the next session?',
        )
      } catch (err) {
        // The timer works without the notification; never block on it.
        console.warn('Focus notification failed', err)
      }
    },
    [reminders.focus],
  )

  const run = useCallback(
    async (fn: () => Promise<void>) => {
      if (busy) return
      setBusy(true)
      try {
        await fn()
        await refresh()
      } catch (err) {
        toast(errorMessage(err), 'error')
      } finally {
        setBusy(false)
      }
    },
    [busy, refresh, toast],
  )

  const save = useCallback(
    async (next: FocusState | null) => {
      await repos.focus.saveState(next)
      await alert(next)
    },
    [repos, alert],
  )

  /** Ends the phase: records it (unless it's a break or too short) and clears the timer. */
  const end = useCallback(
    (s: FocusState, at: number) =>
      run(async () => {
        const status = await repos.focus.finish(s, at)
        await alert(null)
        setFinished({ status, state: s })
      }),
    [repos, run, alert],
  )

  // A phase that ran out while the app was closed or in the background is finished on sight.
  const done = !!state && isFinished(state, now)
  useEffect(() => {
    if (!done || !state || busy) return
    const id = setTimeout(() => void end(state, Date.now()), 0)
    return () => clearTimeout(id)
  }, [done, state, busy, end])

  return {
    state,
    isPending,
    now,
    busy,
    finished,
    dismissFinished: () => setFinished(null),
    start: (opts: { subjectId: string | null; minutes: number; breakMinutes: number | null }) =>
      run(async () => {
        setFinished(null)
        const next = startFocus({ ...opts, sessionId: uuid(), now: Date.now() })
        await repos.focus.saveState(next)
        // Starting a timer is the moment a notification is clearly useful, so this is when to ask.
        if (reminders.focus) await requestReminderPermission().catch(() => false)
        await alert(next)
      }),
    startBreak: (after: FocusState) =>
      run(async () => {
        setFinished(null)
        await save(startBreak(after, uuid(), Date.now()))
      }),
    pause: () => state && run(() => save(pause(state, Date.now()))),
    resume: () => state && run(() => save(resume(state, Date.now()))),
    end: () => state && end(state, Date.now()),
    /** Throws the current phase away without recording it. */
    reset: () =>
      run(async () => {
        setFinished(null)
        await save(null)
      }),
  }
}
