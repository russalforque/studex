import { useSyncExternalStore } from 'react'

/** Tablet landscape and wider: room for list and detail side by side. */
export const WIDE = '(min-width: 1024px)'

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}
