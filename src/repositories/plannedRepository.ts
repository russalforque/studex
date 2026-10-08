import type { SqlDatabase } from '@/db/types'
import type { PlannedExpense } from '@/types/models'
import type { ISODate } from '@/utils/dates'
import { nowISO } from '@/utils/id'
import type { Minor } from '@/utils/money'
import { plannedExpenseSchema, type PlannedExpenseInput } from '@/validation/schemas'
import { AppError, NotFoundError, friendlyDbError } from './errors'

interface PlannedRow {
  id: string
  title: string
  amount_minor: number
  category_id: string
  category_name: string
  category_icon: string
  due_date: string | null
  subject_id: string | null
  subject_name: string | null
  subject_color: string | null
  task_id: string | null
  task_title: string | null
  reserve: number
  note: string | null
  expense_id: string | null
  paid_on: string | null
  paid_amount: number | null
}

const toPlanned = (r: PlannedRow): PlannedExpense => ({
  id: r.id,
  title: r.title,
  amount: r.amount_minor,
  categoryId: r.category_id,
  categoryName: r.category_name,
  categoryIcon: r.category_icon,
  dueDate: r.due_date,
  subjectId: r.subject_id,
  subjectName: r.subject_name,
  subjectColor: r.subject_color,
  taskId: r.task_id,
  taskTitle: r.task_title,
  reserve: r.reserve === 1,
  note: r.note,
  expenseId: r.expense_id,
  paidOn: r.paid_on,
  paidAmount: r.paid_amount,
})

const SELECT = `
  SELECT p.*, c.name AS category_name, c.icon AS category_icon, s.name AS subject_name, s.color AS subject_color,
    t.title AS task_title, e.spent_on AS paid_on, e.amount_minor AS paid_amount
  FROM planned_expenses p
  JOIN expense_categories c ON c.id = p.category_id
  LEFT JOIN subjects s ON s.id = p.subject_id
  LEFT JOIN tasks t ON t.id = p.task_id
  LEFT JOIN expenses e ON e.id = p.expense_id`

/**
 * What a planned expense held back from the budget for a period ending `periodEnd`: everything
 * unpaid and marked to reserve that is due by then (or has no date). Once paid, the real expense
 * counts as spending instead, so the same money is never deducted twice.
 */
export const RESERVED_SQL = `
  SELECT COALESCE(SUM(amount_minor), 0) AS total FROM planned_expenses
  WHERE expense_id IS NULL AND reserve = 1 AND (due_date IS NULL OR due_date <= ?)`

/** Upcoming school expenses, planned before the money is spent. */
export function createPlannedRepository(db: SqlDatabase) {
  return {
    /** Unpaid first (soonest due first, undated last), then paid ones from the last 60 days. */
    async list(today: ISODate): Promise<PlannedExpense[]> {
      const rows = await db.query<PlannedRow>(
        `${SELECT}
         WHERE p.expense_id IS NULL OR e.spent_on >= date(?, '-60 days')
         ORDER BY p.expense_id IS NOT NULL, p.due_date IS NULL, p.due_date, e.spent_on DESC, p.created_at`,
        [today],
      )
      return rows.map(toPlanned)
    },

    async get(id: string): Promise<PlannedExpense> {
      const rows = await db.query<PlannedRow>(`${SELECT} WHERE p.id = ?`, [id])
      if (!rows[0]) throw new NotFoundError('Planned expense')
      return toPlanned(rows[0])
    },

    /** Idempotent on `id` (generated when the form opens). */
    async create(id: string, input: PlannedExpenseInput): Promise<void> {
      const d = plannedExpenseSchema.parse(input)
      const now = nowISO()
      try {
        await db.run(
          `INSERT INTO planned_expenses (id, title, amount_minor, category_id, due_date, subject_id, task_id, reserve, note, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, d.title, d.amount, d.categoryId, d.dueDate, d.subjectId, d.taskId, d.reserve ? 1 : 0, d.note, now, now],
        )
      } catch (err) {
        if (/UNIQUE constraint failed: planned_expenses.id/i.test(String(err))) return
        throw friendlyDbError(err)
      }
    },

    async update(id: string, input: PlannedExpenseInput): Promise<void> {
      const d = plannedExpenseSchema.parse(input)
      const res = await db.run(
        `UPDATE planned_expenses SET title = ?, amount_minor = ?, category_id = ?, due_date = ?, subject_id = ?, task_id = ?,
           reserve = ?, note = ?, updated_at = ? WHERE id = ?`,
        [d.title, d.amount, d.categoryId, d.dueDate, d.subjectId, d.taskId, d.reserve ? 1 : 0, d.note, nowISO(), id],
      )
      if (res.changes === 0) throw new NotFoundError('Planned expense')
    },

    /** Removes the plan. If it was paid, the real expense stays in the history. */
    async remove(id: string): Promise<void> {
      await db.run('DELETE FROM planned_expenses WHERE id = ?', [id])
    },

    /**
     * Records what was actually paid as a normal expense and links it, in one step.
     * `expenseId` comes from the form, so paying twice can only ever create one expense.
     */
    async markPaid(id: string, expenseId: string, paid: { amount: Minor; spentOn: ISODate }): Promise<void> {
      if (!(Number.isInteger(paid.amount) && paid.amount > 0)) throw new AppError('Enter the amount you paid.')
      await db.transaction(async (tx) => {
        const rows = await tx.query<{ title: string; category_id: string; expense_id: string | null }>(
          'SELECT title, category_id, expense_id FROM planned_expenses WHERE id = ?',
          [id],
        )
        const p = rows[0]
        if (!p) throw new NotFoundError('Planned expense')
        if (p.expense_id) return
        const now = nowISO()
        await tx.run(
          `INSERT INTO expenses (id, category_id, amount_minor, description, spent_on, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [expenseId, p.category_id, paid.amount, p.title, paid.spentOn, now, now],
        )
        await tx.run('UPDATE planned_expenses SET expense_id = ?, updated_at = ? WHERE id = ?', [expenseId, now, id])
      })
    },

    /** Undo: removes the expense that paying created, so the plan is unpaid (and reserved) again. */
    async markUnpaid(id: string): Promise<void> {
      await db.transaction(async (tx) => {
        const rows = await tx.query<{ expense_id: string | null }>('SELECT expense_id FROM planned_expenses WHERE id = ?', [id])
        const expenseId = rows[0]?.expense_id
        if (!expenseId) return
        await tx.run('UPDATE planned_expenses SET expense_id = NULL, updated_at = ? WHERE id = ?', [nowISO(), id])
        await tx.run('DELETE FROM expenses WHERE id = ?', [expenseId])
      })
    },

    async reserved(periodEnd: ISODate): Promise<Minor> {
      const rows = await db.query<{ total: number }>(RESERVED_SQL, [periodEnd])
      return rows[0]?.total ?? 0
    },

    async forTask(taskId: string): Promise<PlannedExpense[]> {
      const rows = await db.query<PlannedRow>(`${SELECT} WHERE p.task_id = ? ORDER BY p.created_at`, [taskId])
      return rows.map(toPlanned)
    },
  }
}

export type PlannedRepository = ReturnType<typeof createPlannedRepository>
