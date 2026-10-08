import { describe, expect, it } from 'vitest'
import type { GuideProgress } from '@/types/models'
import { clampStep, tipPending, tourOffer, type TourStep } from './guides'

const step = (id: string, since: number): TourStep => ({ id, route: '/', targets: [id], title: id, body: id, since })
const STEPS = [step('home', 1), step('tasks', 1), step('notes', 2), step('grades', 3)]

const progress = (p: Partial<GuideProgress>): GuideProgress => ({
  id: 'tour',
  version: 1,
  status: 'completed',
  step: 6,
  updatedAt: '2026-10-08T00:00:00Z',
  ...p,
})

describe('tourOffer', () => {
  it('welcomes a student who has never seen the tour', () => {
    expect(tourOffer(undefined, STEPS, 1)).toEqual({ kind: 'welcome' })
  })

  it('stays quiet once the current version was completed, skipped or started', () => {
    expect(tourOffer(progress({}), STEPS, 1)).toBeNull()
    expect(tourOffer(progress({ status: 'skipped', step: 2 }), STEPS, 1)).toBeNull()
    expect(tourOffer(progress({ status: 'started', version: 0 }), STEPS, 3)).toBeNull()
  })

  it('offers only the steps added since the version the student finished', () => {
    expect(tourOffer(progress({ version: 1 }), STEPS, 3)).toEqual({ kind: 'whatsNew', steps: [STEPS[2], STEPS[3]] })
    expect(tourOffer(progress({ version: 2, status: 'skipped', step: 3 }), STEPS, 3)).toEqual({ kind: 'whatsNew', steps: [STEPS[3]] })
  })

  it('does not pull someone who declined the tour into "what\'s new"', () => {
    expect(tourOffer(progress({ status: 'skipped', step: 0 }), STEPS, 3)).toBeNull()
  })

  it('offers nothing when a version bump added no steps', () => {
    expect(tourOffer(progress({ version: 3 }), STEPS, 4)).toBeNull()
  })
})

describe('tipPending', () => {
  it('waits for progress to load, then shows each tip once', () => {
    expect(tipPending(undefined, 'tip.expense')).toBe(false)
    expect(tipPending([], 'tip.expense')).toBe(true)
    expect(tipPending([progress({ id: 'tip.expense', status: 'seen' })], 'tip.expense')).toBe(false)
    expect(tipPending([progress({ id: 'tip.goal', status: 'seen' })], 'tip.expense')).toBe(true)
  })
})

describe('clampStep', () => {
  it('keeps the index inside the tour', () => {
    expect(clampStep(-1, 7)).toBe(0)
    expect(clampStep(9, 7)).toBe(6)
    expect(clampStep(3, 7)).toBe(3)
    expect(clampStep(2, 0)).toBe(0)
  })
})
