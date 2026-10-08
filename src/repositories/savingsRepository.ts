import type { SqlDatabase, SqlExecutor } from '@/db/types'
import type { SavingsGoal, SavingsTransaction, SavingsTxKind } from '@/types/models'
import { nowISO, uuid } from '@/utils/id'
import type { Minor } from '@/utils/money'
import { formatMoney } from '@/utils/money'
import {
  savingsGoalSchema,
  savingsTxSchema,
  type SavingsGoalInput,
  type SavingsTxInput,
} from '@/validation/schemas'
import { AppError, NotFoundError } from './errors'

interface GoalRow {
  id: string
  name: string
  target_minor: number
  target_date: string | null
  balance: number
  created_at: string
}

interface TxRow {
  id: string
  goal_id: string
  kind: SavingsTxKind
  source: SavingsTransaction['source']
  amount_minor: number
  occurred_on: string
  note: string | null
  allowance_id: string | null
  created_at: string
}

const toGoal = (r: GoalRow): SavingsGoal => ({
  id: r.id,
  name: r.name,
  target: r.target_minor,
  targetDate: r.target_date,
  balance: r.balance,
  createdAt: r.created_at,
})

const toTx = (r: TxRow): SavingsTransaction => ({
  id: r.id,
  goalId: r.goal_id,
  kind: r.kind,
  source: r.source,
  amount: r.amount_minor,
  occurredOn: r.occurred_on,
  note: r.note,
  createdAt: r.created_at,
})

const GOAL_SELECT = `
  SELECT g.*, COALESCE((
    SELECT SUM(CASE t.kind WHEN 'deposit' THEN t.amount_minor ELSE -t.amount_minor END)
    FROM savings_transactions t WHERE t.goal_id = g.id
  ), 0) AS balance
  FROM savings_goals g`

export async function goalBalance(ex: SqlExecutor, goalId: string): Promise<Minor> {
  const rows = await ex.query<{ balance: number | null }>(
    `SELECT SUM(CASE kind WHEN 'deposit' THEN amount_minor ELSE -amount_minor END) AS balance
     FROM savings_transactions WHERE goal_id = ?`,
    [goalId],
  )
  return rows[0]?.balance ?? 0
}

export function createSavingsRepository(db: SqlDatabase) {
  return {
    async listGoals(): Promise<SavingsGoal[]> {
      const rows = await db.query<GoalRow>(`${GOAL_SELECT} WHERE g.archived_at IS NULL ORDER BY g.created_at`)
      return rows.map(toGoal)
    },

    async getGoal(id: string): Promise<SavingsGoal> {
      const rows = await db.query<GoalRow>(`${GOAL_SELECT} WHERE g.id = ?`, [id])
      if (!rows[0]) throw new NotFoundError('Savings goal')
      return toGoal(rows[0])
    },

    /** `startingAmount` records money already saved before using Studex; it does not touch the budget. */
    async createGoal(input: SavingsGoalInput, startingAmount: Minor, today: string): Promise<string> {
      const d = savingsGoalSchema.parse(input)
      if (!Number.isInteger(startingAmount) || startingAmount < 0) throw new AppError('Starting amount is not valid.')
      const id = uuid()
      const now = nowISO()
      await db.transaction(async (tx) => {
        await tx.run(
          `INSERT INTO savings_goals (id, name, target_minor, target_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
          [id, d.name, d.target, d.targetDate, now, now],
        )
        if (startingAmount > 0) {
          await tx.run(
            `INSERT INTO savings_transactions (id, goal_id, kind, source, amount_minor, occurred_on, note, created_at, updated_at)
             VALUES (?, ?, 'deposit', 'initial', ?, ?, 'Starting amount', ?, ?)`,
            [uuid(), id, startingAmount, today, now, now],
          )
        }
      })
      return id
    },

    async updateGoal(id: string, input: SavingsGoalInput): Promise<void> {
      const d = savingsGoalSchema.parse(input)
      const res = await db.run(
        'UPDATE savings_goals SET name = ?, target_minor = ?, target_date = ?, updated_at = ? WHERE id = ?',
        [d.name, d.target, d.targetDate, nowISO(), id],
      )
      if (res.changes === 0) throw new NotFoundError('Savings goal')
    },

    /** Deletes the goal and its history. Only called after the student confirms. */
    async deleteGoal(id: string): Promise<void> {
      await db.transaction(async (tx) => {
        await tx.run('UPDATE allowance_plans SET savings_goal_id = NULL, updated_at = ? WHERE savings_goal_id = ?', [
          nowISO(),
          id,
        ])
        await tx.run('DELETE FROM savings_transactions WHERE goal_id = ?', [id])
        await tx.run('DELETE FROM savings_goals WHERE id = ?', [id])
      })
    },

    async listTransactions(goalId: string): Promise<SavingsTransaction[]> {
      const rows = await db.query<TxRow>(
        'SELECT * FROM savings_transactions WHERE goal_id = ? ORDER BY occurred_on DESC, created_at DESC',
        [goalId],
      )
      return rows.map(toTx)
    },

    /** Add or withdraw money. Withdrawals can never take a goal below zero. */
    async addTransaction(goalId: string, kind: SavingsTxKind, input: SavingsTxInput, currency: string): Promise<void> {
      const d = savingsTxSchema.parse(input)
      await db.transaction(async (tx) => {
        const goal = await tx.query('SELECT 1 FROM savings_goals WHERE id = ?', [goalId])
        if (goal.length === 0) throw new NotFoundError('Savings goal')
        if (kind === 'withdrawal') {
          const balance = await goalBalance(tx, goalId)
          if (d.amount > balance) {
            throw new AppError(`You can withdraw up to ${formatMoney(balance, currency)} from this goal.`)
          }
        }
        const now = nowISO()
        await tx.run(
          `INSERT INTO savings_transactions (id, goal_id, kind, source, amount_minor, occurred_on, note, created_at, updated_at)
           VALUES (?, ?, ?, 'manual', ?, ?, ?, ?, ?)`,
          [uuid(), goalId, kind, d.amount, d.occurredOn, d.note, now, now],
        )
      })
    },

    /** Removes one history entry, refusing if that would leave the goal negative. */
    async deleteTransaction(id: string): Promise<void> {
      await db.transaction(async (tx) => {
        const rows = await tx.query<TxRow>('SELECT * FROM savings_transactions WHERE id = ?', [id])
        const row = rows[0]
        if (!row) throw new NotFoundError('Entry')
        if (row.kind === 'deposit') {
          const balance = await goalBalance(tx, row.goal_id)
          if (balance - row.amount_minor < 0) {
            throw new AppError('Removing this deposit would make the balance negative. Remove a later withdrawal first.')
          }
        }
        await tx.run('DELETE FROM savings_transactions WHERE id = ?', [id])
        // An automatic allocation that is undone goes back to the spending budget.
        if (row.allowance_id) {
          await tx.run('UPDATE allowances SET savings_minor = 0, updated_at = ? WHERE id = ?', [nowISO(), row.allowance_id])
        }
      })
    },
  }
}

export type SavingsRepository = ReturnType<typeof createSavingsRepository>
