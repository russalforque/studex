import { beforeEach, describe, expect, it } from 'vitest'
import initSqlJs from 'sql.js'
import { migrate } from '@/db/migrate'
import { SerializedDatabase } from '@/db/SerializedDatabase'
import { createSqlJsDriver } from '@/db/sqljsDriver'
import { uuid } from '@/utils/id'
import { createRepositories, type Repositories } from './index'

let repos: Repositories

async function freshRepos(): Promise<Repositories> {
  const SQL = await initSqlJs()
  const db = new SerializedDatabase(createSqlJsDriver(new SQL.Database()))
  await migrate(db)
  const r = createRepositories(db)
  await db.transaction((tx) =>
    r.settings.completeOnboarding(
      tx,
      { studentName: 'Alex', schoolName: null, currency: 'PHP' },
      { name: '1st Semester', academicYear: '2026–2027' },
    ),
  )
  return r
}

const expense = (amount: number, spentOn: string, categoryId = 'cat-food') => ({
  amount,
  categoryId,
  description: null,
  spentOn,
})

beforeEach(async () => {
  repos = await freshRepos()
})

describe('migrations', () => {
  it('are idempotent', async () => {
    await expect(migrate(repos.db)).resolves.toBe(1)
    const cats = await repos.expenses.listCategories()
    expect(cats).toHaveLength(10)
  })

  it('refuses a database from a newer app version', async () => {
    await repos.db.run("INSERT INTO schema_migrations VALUES (99, 'future', '')")
    await expect(migrate(repos.db)).rejects.toThrow(/newer version/)
  })

  it('refuses a second onboarding', async () => {
    await expect(
      repos.db.transaction((tx) =>
        repos.settings.completeOnboarding(tx, { studentName: 'B', schoolName: null, currency: 'PHP' }, { name: 'T', academicYear: null }),
      ),
    ).rejects.toThrow(/already set up/)
  })
})

describe('transactions', () => {
  it('roll back every statement when one fails', async () => {
    const semester = await repos.settings.currentSemester()
    const subjectId = await repos.subjects.create(semester!.id, {
      name: 'Web Development',
      code: null,
      instructor: null,
      room: null,
      color: '#4F46E5',
      notes: null,
    })
    // Second day collides with the first on the UNIQUE(subject, day, start) constraint.
    await repos.subjects.addSlots({ subjectId, days: [1], startTime: '13:00', endTime: '14:30', room: null })
    await expect(
      repos.subjects.addSlots({ subjectId, days: [3, 1], startTime: '13:00', endTime: '14:30', room: null }),
    ).rejects.toThrow(/already on your schedule/)
    expect(await repos.subjects.listSlotsForSubject(subjectId)).toHaveLength(1)
  })

  it('rejects duplicate subject names regardless of case', async () => {
    const semester = await repos.settings.currentSemester()
    const input = { name: 'Networking', code: null, instructor: null, room: null, color: '#4F46E5', notes: null }
    await repos.subjects.create(semester!.id, input)
    await expect(repos.subjects.create(semester!.id, { ...input, name: 'networking' })).rejects.toThrow(/already have/)
  })
})

describe('expenses', () => {
  it('ignores a double-submitted expense', async () => {
    const id = uuid()
    await repos.expenses.create(id, expense(85_00, '2026-10-06'))
    await repos.expenses.create(id, expense(85_00, '2026-10-06'))
    expect(await repos.expenses.total('2026-10-01', '2026-10-31')).toBe(85_00)
  })

  it('totals by category', async () => {
    await repos.expenses.create(uuid(), expense(85_00, '2026-10-06'))
    await repos.expenses.create(uuid(), expense(40_00, '2026-10-06', 'cat-printing'))
    await repos.expenses.create(uuid(), expense(15_00, '2026-10-07'))
    const totals = await repos.expenses.totalsByCategory('2026-10-05', '2026-10-11')
    expect(totals.map((t) => [t.name, t.total])).toEqual([
      ['Food', 100_00],
      ['Printing', 40_00],
    ])
  })
})

describe('allowance and budget', () => {
  const weekly = {
    amount: 2000_00,
    frequency: 'weekly' as const,
    intervalDays: null,
    anchorDate: '2026-10-05',
    savingsAmount: 200_00,
    savingsGoalId: null,
  }

  it('produces the weekly budget breakdown', async () => {
    await repos.allowance.savePlan(weekly, '2026-10-06')
    await repos.expenses.create(uuid(), expense(500_00, '2026-10-05'))
    await repos.expenses.create(uuid(), expense(120_00, '2026-10-06'))
    const b = await repos.allowance.currentBudget('2026-10-06', [0, 1, 2, 3, 4, 5, 6])
    expect(b!.period).toEqual({ start: '2026-10-05', end: '2026-10-11' })
    expect(b!.summary).toMatchObject({ income: 2000_00, saved: 200_00, available: 1800_00, spent: 620_00, remaining: 1180_00 })
    // (1800 − 500) / 6 days = 216.66 → 216.66 floor, minus 120 today
    expect(b!.summary.safeToSpendToday).toBe(21666 - 120_00)
  })

  it('backfills missed periods once', async () => {
    await repos.allowance.savePlan(weekly, '2026-10-06')
    expect(await repos.allowance.ensureScheduled('2026-10-27')).toBe(3)
    expect(await repos.allowance.ensureScheduled('2026-10-27')).toBe(0)
    const income = await repos.allowance.listIncome()
    expect(income.map((i) => i.receivedOn)).toEqual(['2026-10-26', '2026-10-19', '2026-10-12', '2026-10-05'])
  })

  it('moves the auto-savings into the linked goal', async () => {
    const goalId = await repos.savings.createGoal({ name: 'Laptop', target: 30000_00, targetDate: null }, 1000_00, '2026-10-01')
    await repos.allowance.savePlan({ ...weekly, savingsGoalId: goalId }, '2026-10-06')
    await repos.allowance.ensureScheduled('2026-10-13')
    const goal = await repos.savings.getGoal(goalId)
    expect(goal.balance).toBe(1000_00 + 2 * 200_00)
  })

  it('rewrites only the current period when the plan changes', async () => {
    await repos.allowance.savePlan(weekly, '2026-10-06')
    await repos.allowance.ensureScheduled('2026-10-13')
    await repos.allowance.savePlan({ ...weekly, amount: 2500_00 }, '2026-10-13')
    const income = await repos.allowance.listIncome()
    expect(income.map((i) => [i.receivedOn, i.amount])).toEqual([
      ['2026-10-12', 2500_00],
      ['2026-10-05', 2000_00],
    ])
  })

  it('switching weekly to monthly leaves one allowance in the new period', async () => {
    await repos.allowance.savePlan(weekly, '2026-10-06')
    await repos.allowance.ensureScheduled('2026-10-13')
    await repos.allowance.savePlan(
      { ...weekly, frequency: 'monthly', anchorDate: '2026-10-01', amount: 8000_00 },
      '2026-10-13',
    )
    const b = await repos.allowance.currentBudget('2026-10-13', [])
    expect(b!.period).toEqual({ start: '2026-10-01', end: '2026-10-31' })
    expect(b!.summary.income).toBe(8000_00)
  })

  it('counts manual savings and withdrawals in the period', async () => {
    const goalId = await repos.savings.createGoal({ name: 'Trip', target: 5000_00, targetDate: null }, 0, '2026-10-01')
    await repos.allowance.savePlan({ ...weekly, savingsAmount: 0 }, '2026-10-06')
    await repos.savings.addTransaction(goalId, 'deposit', { amount: 300_00, occurredOn: '2026-10-06', note: null }, 'PHP')
    await repos.savings.addTransaction(goalId, 'withdrawal', { amount: 100_00, occurredOn: '2026-10-06', note: null }, 'PHP')
    const b = await repos.allowance.currentBudget('2026-10-06', [])
    expect(b!.summary.saved).toBe(200_00)
    expect(b!.summary.available).toBe(1800_00)
  })

  it('never lets a withdrawal exceed the balance', async () => {
    const goalId = await repos.savings.createGoal({ name: 'Trip', target: 5000_00, targetDate: null }, 100_00, '2026-10-01')
    await expect(
      repos.savings.addTransaction(goalId, 'withdrawal', { amount: 150_00, occurredOn: '2026-10-06', note: null }, 'PHP'),
    ).rejects.toThrow(/withdraw up to/)
    expect((await repos.savings.getGoal(goalId)).balance).toBe(100_00)
  })

  it('adds extra money to the current period', async () => {
    await repos.allowance.savePlan({ ...weekly, savingsAmount: 0 }, '2026-10-06')
    await repos.allowance.addExtra({ amount: 500_00, receivedOn: '2026-10-06', note: 'Birthday' })
    const b = await repos.allowance.currentBudget('2026-10-06', [])
    expect(b!.summary.income).toBe(2500_00)
  })
})

describe('subjects', () => {
  it('keeps tasks when a subject is deleted', async () => {
    const semester = await repos.settings.currentSemester()
    const subjectId = await repos.subjects.create(semester!.id, {
      name: 'Networking',
      code: null,
      instructor: null,
      room: null,
      color: '#4F46E5',
      notes: null,
    })
    const taskId = uuid()
    await repos.tasks.create(taskId, {
      title: 'Lab report',
      subjectId,
      description: null,
      kind: 'assignment',
      dueDate: '2026-10-07',
      dueTime: null,
      priority: 'medium',
      status: 'todo',
    })
    await repos.subjects.addSlots({ subjectId, days: [1, 3], startTime: '09:00', endTime: '10:00', room: null })
    expect(await repos.subjects.usage(subjectId)).toEqual({ classes: 2, tasks: 1, exams: 0 })
    await repos.subjects.remove(subjectId)
    const tasks = await repos.tasks.list()
    expect(tasks).toHaveLength(1)
    expect(tasks[0]!.subjectId).toBeNull()
  })
})
