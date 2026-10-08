import { createContext, useContext } from 'react'
import type { Repositories } from '@/repositories'
import type { Settings } from '@/types/models'

export const RepositoriesContext = createContext<Repositories | null>(null)

export function useRepos(): Repositories {
  const repos = useContext(RepositoriesContext)
  if (!repos) throw new Error('useRepos must be used inside the database provider')
  return repos
}

export interface Clock {
  now: Date
  /** Local YYYY-MM-DD. */
  today: string
  /** Local HH:MM. */
  time: string
}

export const ClockContext = createContext<Clock | null>(null)

export function useClock(): Clock {
  const clock = useContext(ClockContext)
  if (!clock) throw new Error('useClock must be used inside ClockProvider')
  return clock
}

/** Settings are guaranteed after onboarding; screens behind the onboarding gate read them here. */
export const SettingsContext = createContext<Settings | null>(null)

export function useSettings(): Settings {
  const s = useContext(SettingsContext)
  if (!s) throw new Error('useSettings must be used after onboarding')
  return s
}
