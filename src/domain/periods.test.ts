import { describe, expect, it } from 'vitest'
import { anchorFor, periodContaining, periodsBetween } from './periods'

describe('periodContaining', () => {
  it('daily periods are single days', () => {
    expect(periodContaining({ frequency: 'daily', anchorDate: '2026-01-01' }, '2026-10-06')).toEqual({
      start: '2026-10-06',
      end: '2026-10-06',
    })
  })

  it('weekly periods start on the anchor weekday', () => {
    // 2026-10-05 is a Monday
    const rule = { frequency: 'weekly' as const, anchorDate: '2026-09-07' }
    expect(periodContaining(rule, '2026-10-06')).toEqual({ start: '2026-10-05', end: '2026-10-11' })
    expect(periodContaining(rule, '2026-10-05')).toEqual({ start: '2026-10-05', end: '2026-10-11' })
    expect(periodContaining(rule, '2026-10-11')).toEqual({ start: '2026-10-05', end: '2026-10-11' })
  })

  it('handles dates before the anchor', () => {
    const rule = { frequency: 'weekly' as const, anchorDate: '2026-10-05' }
    expect(periodContaining(rule, '2026-10-04')).toEqual({ start: '2026-09-28', end: '2026-10-04' })
  })

  it('biweekly and custom periods use their length', () => {
    expect(periodContaining({ frequency: 'biweekly', anchorDate: '2026-09-28' }, '2026-10-12')).toEqual({
      start: '2026-10-12',
      end: '2026-10-25',
    })
    expect(periodContaining({ frequency: 'custom', anchorDate: '2026-10-01', intervalDays: 10 }, '2026-10-06')).toEqual(
      { start: '2026-10-01', end: '2026-10-10' },
    )
  })

  it('monthly periods clamp short months without drifting', () => {
    const rule = { frequency: 'monthly' as const, anchorDate: '2026-01-31' }
    expect(periodContaining(rule, '2026-02-15')).toEqual({ start: '2026-01-31', end: '2026-02-27' })
    expect(periodContaining(rule, '2026-02-28')).toEqual({ start: '2026-02-28', end: '2026-03-30' })
    expect(periodContaining(rule, '2026-03-31')).toEqual({ start: '2026-03-31', end: '2026-04-29' })
  })

  it('monthly on the 1st is a calendar month', () => {
    expect(periodContaining({ frequency: 'monthly', anchorDate: '2026-01-01' }, '2026-10-06')).toEqual({
      start: '2026-10-01',
      end: '2026-10-31',
    })
  })
})

describe('periodsBetween', () => {
  it('lists consecutive periods covering the range', () => {
    const periods = periodsBetween({ frequency: 'weekly', anchorDate: '2026-10-05' }, '2026-09-30', '2026-10-13')
    expect(periods.map((p) => p.start)).toEqual(['2026-09-28', '2026-10-05', '2026-10-12'])
  })
})

describe('anchorFor', () => {
  it('weekly anchors on the most recent allowance weekday', () => {
    expect(anchorFor('weekly', '2026-10-06', { weekday: 1 })).toBe('2026-10-05') // Tue → Mon
    expect(anchorFor('weekly', '2026-10-05', { weekday: 1 })).toBe('2026-10-05') // Mon → same day
    expect(anchorFor('weekly', '2026-10-06', { weekday: 3 })).toBe('2026-09-30') // Tue → last Wed
  })

  it('monthly anchors on the most recent allowance day', () => {
    expect(anchorFor('monthly', '2026-10-06', { dayOfMonth: 15 })).toBe('2026-09-15')
    expect(anchorFor('monthly', '2026-10-06', { dayOfMonth: 1 })).toBe('2026-10-01')
    expect(anchorFor('monthly', '2026-03-05', { dayOfMonth: 31 })).toBe('2026-02-28')
  })
})
