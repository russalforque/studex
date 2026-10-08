import type { SqlDatabase, SqlExecutor } from '@/db/types'
import { LOOKBACK_DAYS, unhandledOccurrences, type RecurrenceRule } from '@/domain/recurring'
import type { PendingOccurrence, RecurringExpense } from '@/types/models'
import { addDays, type ISODate } from '@/utils/dates'
import { nowISO, uuid } from '@/utils/id'
import { recurringExpenseSchema, type RecurringExpenseInput } from '@/validation/schemas'
import { AppError, NotFoundError, friendlyDbError } from './errors'

interface RecurringRow {
  id: string
  name: string
  amount_minor: number
  category_id: string
  category_name: string
  category_icon: string
  frequency: RecurringExpense['frequency']
  interval_days: number | null
  start_date: string
  end_date: string | null
  mode: RecurringExpense['mode']
  is_active: number
}

const toRecurring = (r: RecurringRow): RecurringExpense => ({
  id: r.id,
  name: r.name,
  amount: r.amount_minor,
  categoryId: r.category_id,
  categoryName: r.category_name,
  categoryIcon: r.category_icon,
  frequency: r.frequency,
  intervalDays: r.interval_days,
  startDate: r.start_date,
  endDate: r.end_date,
  mode: r.mode,
  active: r.is_active === 1,
})

const ruleOf = (r: RecurringExpense): RecurrenceRule => ({
  frequency: r.frequency,
  intervalDays: r.intervalDays,
  startDate: r.startDate,
  endDate: r.endDate,
})

const SELECT = `
  SELECT r.*, c.name AS category_name, c.icon AS category_icon
  FROM recurring_expenses r JOIN expense_categories c ON c.id = r.category_id`

async function handledDates(ex: SqlExecutor, id: string, since: ISODate): Promise<Set<ISODate>> {
  const rows = await ex.query<{ occurrence_date: string }>(
    'SELECT occurrence_date FROM recurring_occurrences WHERE recurring_id = ? AND occurrence_date >= ?',
    [id, since],
  )
  return new Set(rows.map((r) => r.occurrence_date))
}

/**
 * Claims one occurrence and records its expense, inside the caller's transaction. Transactions
 * run one at a time, so the existence check can't race; the (rule, date) primary key is the
 * backstop — a second insert would fail and roll back rather than record the expense twice.
 */
async function recordOccurrence(tx: SqlExecutor, r: RecurringExpense, date: ISODate, amount = r.amount): Promise<boolean> {
  const seen = await tx.query('SELECT 1 FROM recurring_occurrences WHERE recurring_id = ? AND occurrence_date = ?', [r.id, date])
  if (seen.length > 0) return false
  const now = nowISO()
  await tx.run(
    `INSERT INTO recurring_occurrences (recurring_id, occurrence_date, status, expense_id, created_at) VALUES (?, ?, 'recorded', NULL, ?)`,
    [r.id, date, now],
  )
  const expenseId = uuid()
  await tx.run(
    `INSERT INTO expenses (id, category_id, amount_minor, description, spent_on, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [expenseId, r.categoryId, amount, r.name, date, now, now],
  )
  await tx.run('UPDATE recurring_occurrences SET expense_id = ? WHERE recurring_id = ? AND occurrence_date = ?', [expenseId, r.id, date])
  return true
}

/** Repeating expenses and the reconciliation that records them as their dates come round. */
export function createRecurringRepository(db: SqlDatabase) {
  const repo = {
    async list(): Promise<RecurringExpense[]> {
      const rows = await db.query<RecurringRow>(`${SELECT} ORDER BY r.is_active DESC, r.name COLLATE NOCASE`)
      return rows.map(toRecurring)
    },

    async get(id: string): Promise<RecurringExpense> {
      const rows = await db.query<RecurringRow>(`${SELECT} WHERE r.id = ?`, [id])
      if (!rows[0]) throw new NotFoundError('Recurring expense')
      return toRecurring(rows[0])
    },

    /** Idempotent on `id` (generated when the form opens). */
    async create(id: string, input: RecurringExpenseInput): Promise<void> {
      const d = recurringExpenseSchema.parse(input)
      const now = nowISO()
      try {
        await db.run(
          `INSERT INTO recurring_expenses (id, name, amount_minor, category_id, frequency, interval_days, start_date, end_date, mode,
             is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
          [id, d.name, d.amount, d.categoryId, d.frequency, d.frequency === 'custom' ? d.intervalDays : null, d.startDate, d.endDate, d.mode, now, now],
        )
      } catch (err) {
        if (/UNIQUE constraint failed: recurring_expenses.id/i.test(String(err))) return
        throw friendlyDbError(err)
      }
    },

    /**
     * Changes apply to dates not yet dealt with. Already recorded expenses keep their amount;
     * a moved start date never re-records a date that was recorded or skipped.
     */
    async update(id: string, input: RecurringExpenseInput): Promise<void> {
      const d = recurringExpenseSchema.parse(input)
      const res = await db.run(
        `UPDATE recurring_expenses SET name = ?, amount_minor = ?, category_id = ?, frequency = ?, interval_days = ?, start_date = ?,
           end_date = ?, mode = ?, updated_at = ? WHERE id = ?`,
        [d.name, d.amount, d.categoryId, d.frequency, d.frequency === 'custom' ? d.intervalDays : null, d.startDate, d.endDate, d.mode, nowISO(), id],
      )
      if (res.changes === 0) throw new NotFoundError('Recurring expense')
    },

    /**
     * Pauses or resumes. Resuming skips the dates that passed while paused (before `today`),
     * so nothing is back-filled for the time it was off.
     */
    async setActive(id: string, active: boolean, today: ISODate): Promise<void> {
      const r = await repo.get(id)
      await db.transaction(async (tx) => {
        await tx.run('UPDATE recurring_expenses SET is_active = ?, updated_at = ? WHERE id = ?', [active ? 1 : 0, nowISO(), id])
        if (!active || r.active) return
        const yesterday = addDays(today, -1)
        const handled = await handledDates(tx, id, addDays(today, -LOOKBACK_DAYS))
        for (const date of unhandledOccurrences(ruleOf(r), yesterday, handled)) {
          await tx.run(
            `INSERT INTO recurring_occurrences (recurring_id, occurrence_date, status, expense_id, created_at) VALUES (?, ?, 'skipped', NULL, ?)`,
            [id, date, nowISO()],
          )
        }
      })
    },

    /** Stops it for good. Expenses it already recorded stay in the history. */
    async remove(id: string): Promise<void> {
      await db.run('DELETE FROM recurring_expenses WHERE id = ?', [id])
    },

    /**
     * Brings everything up to `today`: automatic ones are recorded for every due date since the
     * last time the app was open. Doesn't rely on anything running in the background; safe to
     * call on every start and every day change.
     */
    async reconcile(today: ISODate): Promise<number> {
      const rules = (await repo.list()).filter((r) => r.active && r.mode === 'auto')
      let recorded = 0
      for (const r of rules) {
        recorded += await db.transaction(async (tx) => {
          const handled = await handledDates(tx, r.id, addDays(today, -LOOKBACK_DAYS))
          let n = 0
          for (const date of unhandledOccurrences(ruleOf(r), today, handled)) {
            if (await recordOccurrence(tx, r, date)) n++
          }
          return n
        })
      }
      return recorded
    },

    /** Due dates of "ask me first" expenses that are waiting for an answer, oldest first. */
    async pending(today: ISODate): Promise<PendingOccurrence[]> {
      const rules = (await repo.list()).filter((r) => r.active && r.mode === 'confirm')
      const out: PendingOccurrence[] = []
      for (const r of rules) {
        const handled = await handledDates(db, r.id, addDays(today, -LOOKBACK_DAYS))
        for (const date of unhandledOccurrences(ruleOf(r), today, handled)) out.push({ recurring: r, date })
      }
      return out.sort((a, b) => a.date.localeCompare(b.date) || a.recurring.name.localeCompare(b.recurring.name))
    },

    /** Records a pending date, optionally with a different amount this time. */
    async confirm(id: string, date: ISODate, amount?: number): Promise<void> {
      if (amount !== undefined && !(Number.isInteger(amount) && amount > 0)) throw new AppError('Enter an amount.')
      const r = await repo.get(id)
      await db.transaction(async (tx) => {
        await recordOccurrence(tx, r, date, amount ?? r.amount)
      })
    },

    async skip(id: string, date: ISODate): Promise<void> {
      await db.run(
        `INSERT OR IGNORE INTO recurring_occurrences (recurring_id, occurrence_date, status, expense_id, created_at)
         VALUES (?, ?, 'skipped', NULL, ?)`,
        [id, date, nowISO()],
      )
    },

    /** The date of the last occurrence recorded for each rule. */
    async lastRecorded(): Promise<Map<string, ISODate>> {
      const rows = await db.query<{ recurring_id: string; last: string }>(
        "SELECT recurring_id, MAX(occurrence_date) AS last FROM recurring_occurrences WHERE status = 'recorded' GROUP BY recurring_id",
      )
      return new Map(rows.map((r) => [r.recurring_id, r.last]))
    },
  }
  return repo
}

export type RecurringRepository = ReturnType<typeof createRecurringRepository>
