import type { SqlDatabase, SqlExecutor } from '@/db/types'
import { summarizeBudget, type BudgetSummary } from '@/domain/budget'
import { periodContaining, periodsBetween, type Period, type PeriodRule } from '@/domain/periods'
import type { AllowancePlan, Income } from '@/types/models'
import type { ISODate } from '@/utils/dates'
import { nowISO, uuid } from '@/utils/id'
import type { Minor } from '@/utils/money'
import {
  allowancePlanSchema,
  extraIncomeSchema,
  type AllowancePlanInput,
  type ExtraIncomeInput,
} from '@/validation/schemas'
import { AppError, NotFoundError } from './errors'
import { RESERVED_SQL } from './plannedRepository'

interface PlanRow {
  id: string
  amount_minor: number
  frequency: AllowancePlan['frequency']
  interval_days: number | null
  anchor_date: string
  savings_minor: number
  savings_goal_id: string | null
  effective_from: string
}

interface IncomeRow {
  id: string
  plan_id: string | null
  kind: Income['kind']
  amount_minor: number
  savings_minor: number
  period_start: string | null
  period_end: string | null
  received_on: string
  note: string | null
}

const toPlan = (r: PlanRow): AllowancePlan => ({
  id: r.id,
  amount: r.amount_minor,
  frequency: r.frequency,
  intervalDays: r.interval_days,
  anchorDate: r.anchor_date,
  savingsAmount: r.savings_minor,
  savingsGoalId: r.savings_goal_id,
  effectiveFrom: r.effective_from,
})

const toIncome = (r: IncomeRow): Income => ({
  id: r.id,
  planId: r.plan_id,
  kind: r.kind,
  amount: r.amount_minor,
  savingsAmount: r.savings_minor,
  periodStart: r.period_start,
  periodEnd: r.period_end,
  receivedOn: r.received_on,
  note: r.note,
})

export const ruleOf = (p: Pick<AllowancePlan, 'frequency' | 'anchorDate' | 'intervalDays'>): PeriodRule => ({
  frequency: p.frequency,
  anchorDate: p.anchorDate,
  intervalDays: p.intervalDays,
})

/** Generating more than this many missed periods at once means something is wrong with the dates. */
const MAX_BACKFILL = 400

async function activePlan(ex: SqlExecutor): Promise<AllowancePlan | null> {
  const rows = await ex.query<PlanRow>('SELECT * FROM allowance_plans WHERE is_active = 1')
  return rows[0] ? toPlan(rows[0]) : null
}

async function insertScheduled(tx: SqlExecutor, plan: AllowancePlan, period: Period): Promise<void> {
  const id = uuid()
  const now = nowISO()
  await tx.run(
    `INSERT INTO allowances (id, plan_id, kind, amount_minor, savings_minor, period_start, period_end, received_on, created_at, updated_at)
     VALUES (?, ?, 'scheduled', ?, ?, ?, ?, ?, ?, ?)`,
    [id, plan.id, plan.amount, plan.savingsAmount, period.start, period.end, period.start, now, now],
  )
  await syncAutoSavings(tx, id, plan, period.start)
}

/** Keep the automatic savings deposit for one allowance row in line with the plan. */
async function syncAutoSavings(tx: SqlExecutor, allowanceId: string, plan: AllowancePlan, date: ISODate) {
  const now = nowISO()
  if (plan.savingsAmount > 0 && plan.savingsGoalId) {
    const existing = await tx.query<{ id: string }>('SELECT id FROM savings_transactions WHERE allowance_id = ?', [
      allowanceId,
    ])
    if (existing[0]) {
      await tx.run(
        'UPDATE savings_transactions SET goal_id = ?, amount_minor = ?, occurred_on = ?, updated_at = ? WHERE id = ?',
        [plan.savingsGoalId, plan.savingsAmount, date, now, existing[0].id],
      )
    } else {
      await tx.run(
        `INSERT INTO savings_transactions (id, goal_id, kind, source, amount_minor, occurred_on, note, allowance_id, created_at, updated_at)
         VALUES (?, ?, 'deposit', 'allowance', ?, ?, 'From allowance', ?, ?, ?)`,
        [uuid(), plan.savingsGoalId, plan.savingsAmount, date, allowanceId, now, now],
      )
    }
  } else {
    await tx.run("DELETE FROM savings_transactions WHERE allowance_id = ? AND source = 'allowance'", [allowanceId])
  }
}

export interface PeriodTotals {
  income: Minor
  allocated: Minor
  manualSaved: Minor
  spentBeforeToday: Minor
  spentToday: Minor
  reserved: Minor
}

export interface CurrentBudget {
  plan: AllowancePlan
  period: Period
  summary: BudgetSummary
}

export function createAllowanceRepository(db: SqlDatabase) {
  const repo = {
    async getPlan(): Promise<AllowancePlan | null> {
      return activePlan(db)
    },

    /**
     * Makes sure an allowance row exists for every period from the plan's start up to today.
     * Safe to call on every app start: existing periods are skipped, so nothing is duplicated.
     */
    async ensureScheduled(today: ISODate): Promise<number> {
      return db.transaction(async (tx) => {
        const plan = await activePlan(tx)
        if (!plan) return 0
        const last = await tx.query<{ start: string | null }>(
          "SELECT MAX(period_start) AS start FROM allowances WHERE plan_id = ? AND kind = 'scheduled'",
          [plan.id],
        )
        const from = last[0]?.start && last[0].start > plan.effectiveFrom ? last[0].start : plan.effectiveFrom
        const periods = periodsBetween(ruleOf(plan), from, today, MAX_BACKFILL)
        const existing = new Set(
          (
            await tx.query<{ period_start: string }>(
              "SELECT period_start FROM allowances WHERE plan_id = ? AND kind = 'scheduled' AND period_start >= ?",
              [plan.id, periods[0]?.start ?? from],
            )
          ).map((r) => r.period_start),
        )
        let created = 0
        for (const p of periods) {
          if (p.start < plan.effectiveFrom || existing.has(p.start)) continue
          await insertScheduled(tx, plan, p)
          created++
        }
        return created
      })
    },

    /**
     * Creates or changes the allowance plan. The change applies from the current period:
     * the current period's allowance is rewritten to match, earlier periods stay as they were.
     */
    async savePlan(input: AllowancePlanInput, today: ISODate): Promise<void> {
      const d = allowancePlanSchema.parse(input)
      const rule: PeriodRule = { frequency: d.frequency, anchorDate: d.anchorDate, intervalDays: d.intervalDays }
      const current = periodContaining(rule, today)
      if (current.start > today) throw new AppError('The first allowance day must be today or earlier.')

      await db.transaction(async (tx) => {
        const now = nowISO()
        const old = await activePlan(tx)
        const id = old?.id ?? uuid()
        const intervalDays = d.frequency === 'custom' ? d.intervalDays : null
        if (old) {
          await tx.run(
            `UPDATE allowance_plans SET amount_minor = ?, frequency = ?, interval_days = ?, anchor_date = ?, savings_minor = ?,
               savings_goal_id = ?, effective_from = ?, updated_at = ? WHERE id = ?`,
            [d.amount, d.frequency, intervalDays, d.anchorDate, d.savingsAmount, d.savingsGoalId, current.start, now, id],
          )
        } else {
          await tx.run(
            `INSERT INTO allowance_plans (id, amount_minor, frequency, interval_days, anchor_date, savings_minor, savings_goal_id,
               effective_from, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
            [id, d.amount, d.frequency, intervalDays, d.anchorDate, d.savingsAmount, d.savingsGoalId, current.start, now, now],
          )
        }
        const plan: AllowancePlan = {
          id,
          amount: d.amount,
          frequency: d.frequency,
          intervalDays,
          anchorDate: d.anchorDate,
          savingsAmount: d.savingsAmount,
          savingsGoalId: d.savingsGoalId,
          effectiveFrom: current.start,
        }

        // Scheduled rows that now fall inside the new current period (from any plan, old or
        // previously removed) are replaced by a single row for the new plan.
        const overlapping = await tx.query<{ id: string; plan_id: string | null }>(
          `SELECT id, plan_id FROM allowances
           WHERE kind = 'scheduled' AND ((received_on BETWEEN ? AND ?) OR (period_start <= ? AND period_end >= ?))
           ORDER BY CASE WHEN plan_id = ? THEN 0 ELSE 1 END, received_on DESC`,
          [current.start, current.end, today, today, id],
        )
        const [keep, ...rest] = overlapping
        for (const r of rest) {
          await tx.run("DELETE FROM savings_transactions WHERE allowance_id = ? AND source = 'allowance'", [r.id])
          await tx.run('DELETE FROM allowances WHERE id = ?', [r.id])
        }
        if (keep) {
          await tx.run(
            `UPDATE allowances SET plan_id = ?, amount_minor = ?, savings_minor = ?, period_start = ?, period_end = ?,
               received_on = ?, updated_at = ? WHERE id = ?`,
            [id, plan.amount, plan.savingsAmount, current.start, current.end, current.start, now, keep.id],
          )
          await syncAutoSavings(tx, keep.id, plan, current.start)
        } else {
          await insertScheduled(tx, plan, current)
        }
      })
    },

    /** Stops future allowances. Everything already recorded stays. */
    async stopPlan(): Promise<void> {
      await db.run('UPDATE allowance_plans SET is_active = 0, updated_at = ? WHERE is_active = 1', [nowISO()])
    },

    async listIncome(limit = 50): Promise<Income[]> {
      const rows = await db.query<IncomeRow>(
        'SELECT * FROM allowances ORDER BY received_on DESC, created_at DESC LIMIT ?',
        [limit],
      )
      return rows.map(toIncome)
    },

    async addExtra(input: ExtraIncomeInput): Promise<void> {
      const d = extraIncomeSchema.parse(input)
      const now = nowISO()
      await db.run(
        `INSERT INTO allowances (id, plan_id, kind, amount_minor, received_on, note, created_at, updated_at)
         VALUES (?, NULL, 'extra', ?, ?, ?, ?, ?)`,
        [uuid(), d.amount, d.receivedOn, d.note, now, now],
      )
    },

    /** Correct what actually arrived (e.g. a smaller allowance this week). */
    async updateIncome(id: string, input: ExtraIncomeInput): Promise<void> {
      const d = extraIncomeSchema.parse(input)
      await db.transaction(async (tx) => {
        const rows = await tx.query<IncomeRow>('SELECT * FROM allowances WHERE id = ?', [id])
        const row = rows[0]
        if (!row) throw new NotFoundError('Allowance entry')
        if (d.amount < row.savings_minor) {
          throw new AppError('This is less than the amount set aside for savings. Lower your savings first.')
        }
        // Scheduled entries keep their period; only extras can move to another date.
        const receivedOn = row.kind === 'scheduled' ? row.received_on : d.receivedOn
        await tx.run('UPDATE allowances SET amount_minor = ?, received_on = ?, note = ?, updated_at = ? WHERE id = ?', [
          d.amount,
          receivedOn,
          d.note,
          nowISO(),
          id,
        ])
      })
    },

    async removeExtra(id: string): Promise<void> {
      const res = await db.run("DELETE FROM allowances WHERE id = ? AND kind = 'extra'", [id])
      if (res.changes === 0) throw new AppError('Scheduled allowances can be edited but not deleted.')
    },

    async periodTotals(period: Period, today: ISODate): Promise<PeriodTotals> {
      const rows = await db.query<{
        income: number | null
        allocated: number | null
        manual_saved: number | null
        spent_before: number | null
        spent_today: number | null
        planned_today: number | null
        reserved: number | null
      }>(
        `SELECT
          (SELECT SUM(amount_minor) FROM allowances WHERE received_on BETWEEN ? AND ?) AS income,
          (SELECT SUM(savings_minor) FROM allowances WHERE received_on BETWEEN ? AND ?) AS allocated,
          (SELECT SUM(CASE kind WHEN 'deposit' THEN amount_minor ELSE -amount_minor END)
             FROM savings_transactions WHERE source = 'manual' AND occurred_on BETWEEN ? AND ?) AS manual_saved,
          (SELECT SUM(amount_minor) FROM expenses WHERE spent_on >= ? AND spent_on < ?) AS spent_before,
          (SELECT SUM(amount_minor) FROM expenses WHERE spent_on = ?) AS spent_today,
          (SELECT SUM(e.amount_minor) FROM expenses e JOIN planned_expenses p ON p.expense_id = e.id
             WHERE e.spent_on = ? AND p.reserve = 1 AND (p.due_date IS NULL OR p.due_date <= ?)) AS planned_today,
          (${RESERVED_SQL}) AS reserved`,
        // Plain positional parameters: numbered ones are not portable across the native plugins.
        [period.start, period.end, period.start, period.end, period.start, period.end, period.start, today, today, today, period.end, period.end],
      )
      const r = rows[0]
      // A reserved planned expense paid today was already set aside this morning, so it counts with
      // the spending before today: it must not also eat into today's own amount.
      const plannedToday = r?.planned_today ?? 0
      return {
        income: r?.income ?? 0,
        allocated: r?.allocated ?? 0,
        manualSaved: r?.manual_saved ?? 0,
        spentBeforeToday: (r?.spent_before ?? 0) + plannedToday,
        spentToday: (r?.spent_today ?? 0) - plannedToday,
        reserved: r?.reserved ?? 0,
      }
    },

    /** Everything the Home and Budget screens need for the current period, or null without a plan. */
    async currentBudget(today: ISODate, spendingDays: number[]): Promise<CurrentBudget | null> {
      const plan = await activePlan(db)
      if (!plan) return null
      const period = periodContaining(ruleOf(plan), today)
      const t = await repo.periodTotals(period, today)
      const summary = summarizeBudget({
        period,
        today,
        income: t.income,
        saved: t.allocated + t.manualSaved,
        spentBeforeToday: t.spentBeforeToday,
        spentToday: t.spentToday,
        spendingDays,
        reserved: t.reserved,
      })
      return { plan, period, summary }
    },
  }
  return repo
}

export type AllowanceRepository = ReturnType<typeof createAllowanceRepository>
