import type { SqlDatabase } from '@/db/types'
import type { Expense, ExpenseCategory } from '@/types/models'
import type { ISODate } from '@/utils/dates'
import { nowISO, uuid } from '@/utils/id'
import type { Minor } from '@/utils/money'
import { categorySchema, expenseSchema, type CategoryInput, type ExpenseInput } from '@/validation/schemas'
import { AppError, NotFoundError, friendlyDbError } from './errors'

interface CategoryRow {
  id: string
  name: string
  icon: string
  is_default: number
  sort_order: number
}

interface ExpenseRow {
  id: string
  category_id: string
  category_name: string
  category_icon: string
  amount_minor: number
  description: string | null
  spent_on: string
  created_at: string
}

const toCategory = (r: CategoryRow): ExpenseCategory => ({
  id: r.id,
  name: r.name,
  icon: r.icon,
  isDefault: r.is_default === 1,
  sortOrder: r.sort_order,
})

const toExpense = (r: ExpenseRow): Expense => ({
  id: r.id,
  categoryId: r.category_id,
  categoryName: r.category_name,
  categoryIcon: r.category_icon,
  amount: r.amount_minor,
  description: r.description,
  spentOn: r.spent_on,
  createdAt: r.created_at,
})

const SELECT = `
  SELECT e.*, c.name AS category_name, c.icon AS category_icon
  FROM expenses e JOIN expense_categories c ON c.id = e.category_id`

export interface CategoryTotal {
  categoryId: string
  name: string
  icon: string
  total: Minor
}

const DUPLICATE_CATEGORY = 'You already have a category with that name.'

export function createExpenseRepository(db: SqlDatabase) {
  return {
    // ---- Categories ----

    async listCategories(): Promise<ExpenseCategory[]> {
      const rows = await db.query<CategoryRow>(
        'SELECT * FROM expense_categories WHERE archived_at IS NULL ORDER BY sort_order, name COLLATE NOCASE',
      )
      return rows.map(toCategory)
    },

    async createCategory(input: CategoryInput): Promise<string> {
      const d = categorySchema.parse(input)
      const id = uuid()
      const now = nowISO()
      try {
        await db.run(
          `INSERT INTO expense_categories (id, name, icon, is_default, sort_order, created_at, updated_at)
           VALUES (?, ?, ?, 0, (SELECT COALESCE(MAX(sort_order), 0) + 10 FROM expense_categories), ?, ?)`,
          [id, d.name, d.icon, now, now],
        )
      } catch (err) {
        throw friendlyDbError(err, DUPLICATE_CATEGORY)
      }
      return id
    },

    async updateCategory(id: string, input: CategoryInput): Promise<void> {
      const d = categorySchema.parse(input)
      try {
        await db.run('UPDATE expense_categories SET name = ?, icon = ?, updated_at = ? WHERE id = ?', [
          d.name,
          d.icon,
          nowISO(),
          id,
        ])
      } catch (err) {
        throw friendlyDbError(err, DUPLICATE_CATEGORY)
      }
    },

    /** Hides a custom category from pickers. Past expenses keep it. */
    async archiveCategory(id: string): Promise<void> {
      const rows = await db.query<{ is_default: number }>('SELECT is_default FROM expense_categories WHERE id = ?', [id])
      if (!rows[0]) throw new NotFoundError('Category')
      if (rows[0].is_default === 1) throw new AppError('Built-in categories cannot be removed.')
      await db.run('UPDATE expense_categories SET archived_at = ?, updated_at = ? WHERE id = ?', [nowISO(), nowISO(), id])
    },

    // ---- Expenses ----

    /** Idempotent on `id`, so a double-tapped Save never records the expense twice. */
    async create(id: string, input: ExpenseInput): Promise<void> {
      const d = expenseSchema.parse(input)
      const now = nowISO()
      try {
        await db.run(
          `INSERT INTO expenses (id, category_id, amount_minor, description, spent_on, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [id, d.categoryId, d.amount, d.description, d.spentOn, now, now],
        )
      } catch (err) {
        if (/UNIQUE constraint failed: expenses.id/i.test(String(err))) return
        throw friendlyDbError(err)
      }
    },

    async update(id: string, input: ExpenseInput): Promise<void> {
      const d = expenseSchema.parse(input)
      const res = await db.run(
        'UPDATE expenses SET category_id = ?, amount_minor = ?, description = ?, spent_on = ?, updated_at = ? WHERE id = ?',
        [d.categoryId, d.amount, d.description, d.spentOn, nowISO(), id],
      )
      if (res.changes === 0) throw new NotFoundError('Expense')
    },

    async remove(id: string): Promise<void> {
      await db.run('DELETE FROM expenses WHERE id = ?', [id])
    },

    async listRange(from: ISODate, to: ISODate): Promise<Expense[]> {
      const rows = await db.query<ExpenseRow>(
        `${SELECT} WHERE e.spent_on BETWEEN ? AND ? ORDER BY e.spent_on DESC, e.created_at DESC`,
        [from, to],
      )
      return rows.map(toExpense)
    },

    async recent(limit = 5): Promise<Expense[]> {
      const rows = await db.query<ExpenseRow>(`${SELECT} ORDER BY e.spent_on DESC, e.created_at DESC LIMIT ?`, [limit])
      return rows.map(toExpense)
    },

    async total(from: ISODate, to: ISODate): Promise<Minor> {
      const rows = await db.query<{ total: number | null }>(
        'SELECT SUM(amount_minor) AS total FROM expenses WHERE spent_on BETWEEN ? AND ?',
        [from, to],
      )
      return rows[0]?.total ?? 0
    },

    async totalsByCategory(from: ISODate, to: ISODate): Promise<CategoryTotal[]> {
      const rows = await db.query<{ category_id: string; name: string; icon: string; total: number }>(
        `SELECT c.id AS category_id, c.name, c.icon, SUM(e.amount_minor) AS total
         FROM expenses e JOIN expense_categories c ON c.id = e.category_id
         WHERE e.spent_on BETWEEN ? AND ?
         GROUP BY c.id ORDER BY total DESC`,
        [from, to],
      )
      return rows.map((r) => ({ categoryId: r.category_id, name: r.name, icon: r.icon, total: r.total }))
    },
  }
}

export type ExpenseRepository = ReturnType<typeof createExpenseRepository>
