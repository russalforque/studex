import { useEffect, useState, type ReactNode } from 'react'
import { nowTime, todayISO } from '@/utils/dates'
import { ClockContext, type Clock } from './contexts'

function read(): Clock {
  const now = new Date()
  return { now, today: todayISO(now), time: nowTime(now) }
}

/**
 * Minute-resolution clock so "next class", overdue states and the budget day
 * roll over on their own, including after the app returns from the background.
 */
export function ClockProvider({ children }: { children: ReactNode }) {
  const [clock, setClock] = useState(read)

  useEffect(() => {
    const tick = () =>
      setClock((prev) => {
        const next = read()
        return next.time === prev.time && next.today === prev.today ? prev : next
      })
    const id = setInterval(tick, 15_000)
    const onVisible = () => document.visibilityState === 'visible' && tick()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return <ClockContext.Provider value={clock}>{children}</ClockContext.Provider>
}
