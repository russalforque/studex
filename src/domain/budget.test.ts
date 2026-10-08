import { describe, expect, it } from 'vitest'
import { countSpendingDays, summarizeBudget, type BudgetInput } from './budget'

// Week of Mon 2026-10-05 … Sun 2026-10-11. Amounts in minor units (₱1 = 100).
const week = { start: '2026-10-05', end: '2026-10-11' }
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]
const SCHOOL_DAYS = [1, 2, 3, 4, 5]

function input(over: Partial<BudgetInput>): BudgetInput {
  return {
    period: week,
    today: '2026-10-05',
    income: 2000_00,
    saved: 0,
    spentBeforeToday: 0,
    spentToday: 0,
    spendingDays: ALL_DAYS,
    ...over,
  }
}

describe('countSpendingDays', () => {
  it('counts every day by default', () => {
    expect(countSpendingDays(week.start, week.end, [], '2026-10-05')).toBe(7)
  })
  it('counts only school days but always includes today', () => {
    expect(countSpendingDays(week.start, week.end, SCHOOL_DAYS, '2026-10-05')).toBe(5)
    expect(countSpendingDays('2026-10-10', week.end, SCHOOL_DAYS, '2026-10-10')).toBe(1)
  })
})

describe('summarizeBudget', () => {
  it('computes the allowance breakdown', () => {
    const s = summarizeBudget(input({ saved: 200_00, spentBeforeToday: 1050_00, spentToday: 200_00, today: '2026-10-09' }))
    expect(s.available).toBe(1800_00)
    expect(s.spent).toBe(1250_00)
    expect(s.remaining).toBe(550_00)
  })

  it('splits the money evenly on day one', () => {
    const s = summarizeBudget(input({ income: 2100_00 }))
    expect(s.daysLeft).toBe(7)
    expect(s.safeToSpendToday).toBe(300_00)
  })

  it('matches the spec example: ₱850 left with 3 school days → ₱283 today', () => {
    // Wednesday, school days only: Wed, Thu, Fri remain.
    const s = summarizeBudget(
      input({ today: '2026-10-07', spendingDays: SCHOOL_DAYS, income: 2000_00, spentBeforeToday: 1150_00 }),
    )
    expect(s.remaining).toBe(850_00)
    expect(s.daysLeft).toBe(3)
    expect(s.safeToSpendToday).toBe(28333) // ₱283.33
  })

  it("subtracts today's spending from today's allowance only", () => {
    const s = summarizeBudget(input({ income: 2100_00, spentToday: 100_00 }))
    expect(s.dailyAllowance).toBe(300_00)
    expect(s.safeToSpendToday).toBe(200_00)
    expect(s.overToday).toBe(0)
  })

  it('never shows a negative safe amount and reports the overspend', () => {
    const s = summarizeBudget(input({ income: 2100_00, spentToday: 450_00 }))
    expect(s.safeToSpendToday).toBe(0)
    expect(s.overToday).toBe(150_00)
  })

  it('flags spending faster than plan', () => {
    // Tuesday (day 2 of 7): expected ≈ ₱571; spent ₱900.
    const s = summarizeBudget(input({ today: '2026-10-06', spentBeforeToday: 900_00 }))
    expect(s.pace).toBe('fast')
  })

  it('stays on track within the tolerance', () => {
    const s = summarizeBudget(input({ today: '2026-10-06', spentBeforeToday: 600_00 }))
    expect(s.pace).toBe('on_track')
  })

  it('reports over budget when remaining is negative', () => {
    const s = summarizeBudget(input({ today: '2026-10-10', spentBeforeToday: 2100_00 }))
    expect(s.remaining).toBe(-100_00)
    expect(s.pace).toBe('over')
    expect(s.safeToSpendToday).toBe(0)
  })

  it('gives the whole remainder on the last day', () => {
    const s = summarizeBudget(input({ today: '2026-10-11', spentBeforeToday: 1500_00 }))
    expect(s.daysLeft).toBe(1)
    expect(s.safeToSpendToday).toBe(500_00)
  })

  it('treats savings withdrawals (negative saved) as extra spending money', () => {
    const s = summarizeBudget(input({ saved: -300_00 }))
    expect(s.available).toBe(2300_00)
  })
})
