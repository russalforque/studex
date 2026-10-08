import { createContext, useContext } from 'react'

export interface TourControls {
  /** Start the full app tour, or only the given step ids (feature guides). */
  start: (stepIds?: string[]) => void
  active: boolean
}

export const TourContext = createContext<TourControls>({ start: () => undefined, active: false })

export function useTour() {
  return useContext(TourContext)
}
