import { anchorFor, periodContaining } from '@/domain/periods'
import type { AllowancePlan, Frequency } from '@/types/models'
import { dayOfWeek, type ISODate } from '@/utils/dates'
import { minorToInput, parseMoney } from '@/utils/money'
import { allowancePlanSchema, validate, type AllowancePlanInput, type FieldErrors } from '@/validation/schemas'

export interface AllowanceFormValues {
  amount: string
  frequency: Frequency
  weekday: number
  dayOfMonth: number
  /** Most recent allowance date, for every-two-weeks and custom plans. */
  lastDate: ISODate
  intervalDays: string
  savingsAmount: string
  /** Savings can be entered as a fixed amount or a share of each allowance. */
  savingsMode: 'amount' | 'percent'
  savingsPercent: string
  savingsGoalId: string | null
}

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  biweekly: 'Every two weeks',
  monthly: 'Monthly',
  custom: 'Custom',
}

export function initialAllowanceValues(today: ISODate, plan?: AllowancePlan | null): AllowanceFormValues {
  const anchorNow = plan ? periodContaining(plan, today).start : today
  return {
    amount: plan ? minorToInput(plan.amount) : '',
    frequency: plan?.frequency ?? 'weekly',
    weekday: plan ? dayOfWeek(anchorNow) : 1,
    dayOfMonth: plan ? Number(plan.anchorDate.slice(8, 10)) : 1,
    lastDate: anchorNow,
    intervalDays: plan?.intervalDays ? String(plan.intervalDays) : '10',
    savingsAmount: plan && plan.savingsAmount > 0 ? minorToInput(plan.savingsAmount) : '',
    savingsMode: 'amount',
    savingsPercent: '',
    savingsGoalId: plan?.savingsGoalId ?? null,
  }
}

/** Turn the friendly form into a plan input, or field errors. */
export function toPlanInput(
  v: AllowanceFormValues,
  today: ISODate,
): { ok: true; data: AllowancePlanInput } | { ok: false; errors: FieldErrors } {
  const amount = parseMoney(v.amount)
  const savings = savingsFromForm(v, amount)
  if (savings === null) {
    return { ok: false, errors: { savingsAmount: v.savingsMode === 'percent' ? 'Enter 0 to 100' : 'Enter a valid amount' } }
  }
  const interval = v.frequency === 'custom' ? Number.parseInt(v.intervalDays, 10) : null
  if (v.frequency === 'custom' && (!interval || interval < 1 || interval > 366)) {
    return { ok: false, errors: { intervalDays: 'Enter 1 to 366 days' } }
  }
  if ((v.frequency === 'custom' || v.frequency === 'biweekly') && v.lastDate > today) {
    return { ok: false, errors: { lastDate: 'Pick today or an earlier date' } }
  }
  const anchorDate = anchorFor(v.frequency, today, {
    weekday: v.weekday,
    dayOfMonth: v.dayOfMonth,
    startDate: v.lastDate,
  })
  const res = validate(allowancePlanSchema, {
    amount: amount ?? undefined,
    frequency: v.frequency,
    intervalDays: interval,
    anchorDate: v.frequency === 'biweekly' ? v.lastDate : anchorDate,
    savingsAmount: savings,
    savingsGoalId: savings > 0 ? v.savingsGoalId : null,
  })
  return res.ok ? { ok: true, data: res.data } : res
}

/**
 * The savings set aside per allowance, in minor units. A percentage is turned into an
 * amount (rounded down to whole units of currency) so the plan always stores money.
 */
export function savingsFromForm(v: Pick<AllowanceFormValues, 'savingsMode' | 'savingsAmount' | 'savingsPercent'>, amount: number | null): number | null {
  if (v.savingsMode === 'percent') {
    const t = v.savingsPercent.trim()
    if (!t) return 0
    const pct = Number(t.replace('%', ''))
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) return null
    return Math.floor(((amount ?? 0) * pct) / 100 / 100) * 100
  }
  return v.savingsAmount.trim() ? parseMoney(v.savingsAmount) : 0
}
