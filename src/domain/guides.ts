import type { GuideProgress } from '@/types/models'

/** One stop on the app tour: a screen, the element to spotlight there, and what to say about it. */
export interface TourStep {
  id: string
  /** Route to open before looking for the target. */
  route: string
  /** `data-tour` names, in order of preference; the first one visible on screen is used. */
  targets: string[]
  title: string
  body: string
  /** Tour version that introduced this step. Later versions replay only their new steps. */
  since: number
}

export type TourOffer = { kind: 'welcome' } | { kind: 'whatsNew'; steps: TourStep[] } | null

/**
 * What to offer when the app opens, if anything:
 * - never seen the tour: the welcome prompt (once; "Maybe later" counts as an answer);
 * - finished or skipped an older version after taking part: only the steps added since;
 * - otherwise nothing, so the tour never shows on every launch.
 */
export function tourOffer(progress: GuideProgress | undefined, steps: TourStep[], version: number): TourOffer {
  if (!progress) return { kind: 'welcome' }
  if (progress.status === 'started' || progress.version >= version) return null
  // Someone who declined the tour outright shouldn't be pulled into "what's new" either.
  if (progress.status === 'skipped' && progress.step === 0) return null
  const fresh = steps.filter((s) => s.since > progress.version)
  return fresh.length > 0 ? { kind: 'whatsNew', steps: fresh } : null
}

/** Feature tips show once: any stored record means the student has already seen it. */
export function tipPending(progress: GuideProgress[] | undefined, tipId: string): boolean {
  if (!progress) return false
  return !progress.some((p) => p.id === tipId)
}

/** Clamp a step index to the tour, so a shrinking step list can never leave it out of range. */
export function clampStep(index: number, count: number): number {
  if (count <= 0) return 0
  return Math.min(Math.max(0, Math.trunc(index)), count - 1)
}
