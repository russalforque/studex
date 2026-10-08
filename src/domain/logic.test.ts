import { describe, expect, it } from 'vitest'
import type { ClassSlotView, Task } from '@/types/models'
import { parseMoney, minorToInput } from '@/utils/money'
import { dayOfWeek, weekdaySummary } from '@/utils/dates'
import { findNextClass, withFreeTime } from './schedule'
import { groupTasks, isOverdue } from './tasks'
import { monthlyNeeded, progressPercent, savingsBalance } from './savings'

describe('parseMoney', () => {
  it.each([
    ['85', 8500],
    ['85.5', 8550],
    ['1,180.25', 118025],
    ['2 000', 200000],
    ['.5', 50],
    ['0', 0],
  ])('%s → %d', (text, minor) => expect(parseMoney(text)).toBe(minor))

  it.each(['', 'abc', '1.234', '-5', '1.2.3'])('rejects %j', (text) => expect(parseMoney(text)).toBeNull())

  it('round-trips through the input format', () => {
    expect(minorToInput(8550)).toBe('85.50')
    expect(minorToInput(200000)).toBe('2000')
  })
})

describe('dates', () => {
  it('knows weekdays', () => {
    expect(dayOfWeek('2026-10-06')).toBe(2) // Tuesday
    expect(dayOfWeek('1969-12-28')).toBe(0)
  })
  it('summarises weekdays compactly', () => {
    expect(weekdaySummary([5, 1, 3])).toBe('MWF')
    expect(weekdaySummary([2, 4])).toBe('TTh')
    expect(weekdaySummary([6])).toBe('Sat')
  })
})

function slot(id: string, day: number, start: string, end: string): ClassSlotView {
  return {
    id,
    subjectId: id,
    dayOfWeek: day,
    startTime: start,
    endTime: end,
    room: null,
    subjectName: id,
    subjectColor: '#000',
    instructor: null,
    displayRoom: null,
  }
}

describe('schedule', () => {
  const slots = [slot('web', 2, '13:00', '14:30'), slot('db', 2, '09:00', '10:30'), slot('net', 4, '08:00', '09:00')]

  it('finds the class in progress', () => {
    expect(findNextClass(slots, '2026-10-06', '13:30')).toMatchObject({ status: 'now', slot: { id: 'web' } })
  })
  it('finds the next class later today', () => {
    expect(findNextClass(slots, '2026-10-06', '11:00')).toMatchObject({ status: 'next', slot: { id: 'web' }, date: '2026-10-06' })
  })
  it('rolls over to a later day', () => {
    expect(findNextClass(slots, '2026-10-06', '15:00')).toMatchObject({ slot: { id: 'net' }, date: '2026-10-08' })
  })
  it('inserts free time between classes', () => {
    const items = withFreeTime([slots[1]!, slots[0]!])
    expect(items.map((i) => i.type)).toEqual(['class', 'gap', 'class'])
    expect(items[1]).toMatchObject({ minutes: 150 })
  })
})

function task(over: Partial<Task>): Task {
  return {
    id: Math.random().toString(),
    subjectId: null,
    subjectName: null,
    subjectColor: null,
    title: 't',
    description: null,
    kind: 'assignment',
    dueDate: null,
    dueTime: null,
    priority: 'medium',
    status: 'todo',
    completedAt: null,
    createdAt: '',
    ...over,
  }
}

describe('tasks', () => {
  it('detects overdue tasks', () => {
    expect(isOverdue(task({ dueDate: '2026-10-05' }), '2026-10-06', '08:00')).toBe(true)
    expect(isOverdue(task({ dueDate: '2026-10-06', dueTime: '07:00' }), '2026-10-06', '08:00')).toBe(true)
    expect(isOverdue(task({ dueDate: '2026-10-06' }), '2026-10-06', '23:00')).toBe(false)
    expect(isOverdue(task({ dueDate: '2026-10-05', status: 'completed' }), '2026-10-06', '08:00')).toBe(false)
  })

  it('groups tasks', () => {
    const g = groupTasks(
      [
        task({ title: 'late', dueDate: '2026-10-01' }),
        task({ title: 'today', dueDate: '2026-10-06' }),
        task({ title: 'later', dueDate: '2026-10-09' }),
        task({ title: 'someday' }),
        task({ title: 'done', dueDate: '2026-10-06', status: 'completed', completedAt: '2026-10-06T01:00:00Z' }),
      ],
      '2026-10-06',
      '08:00',
    )
    expect(g.overdue.map((t) => t.title)).toEqual(['late'])
    expect(g.today.map((t) => t.title)).toEqual(['today'])
    expect(g.upcoming.map((t) => t.title)).toEqual(['later'])
    expect(g.someday.map((t) => t.title)).toEqual(['someday'])
    expect(g.doneToday.map((t) => t.title)).toEqual(['done'])
  })
})

describe('savings', () => {
  it('derives balances and progress', () => {
    const balance = savingsBalance([
      { kind: 'deposit', amount: 10000_00 },
      { kind: 'withdrawal', amount: 1500_00 },
    ])
    expect(balance).toBe(8500_00)
    expect(progressPercent(balance, 30000_00)).toBe(28)
    expect(progressPercent(40000_00, 30000_00)).toBe(100)
  })
  it('estimates the monthly amount needed', () => {
    expect(monthlyNeeded(0, 1200_00, '2027-10-06', '2026-10-06')).toBe(100_00)
    expect(monthlyNeeded(1200_00, 1200_00, '2027-10-06', '2026-10-06')).toBeNull()
    expect(monthlyNeeded(0, 1200_00, null, '2026-10-06')).toBeNull()
  })
})

describe('dueLabel', () => {
  it('reads like a person would say it', async () => {
    const { dueLabel } = await import('@/utils/dates')
    const today = '2026-10-08' // Thursday
    expect(dueLabel('2026-10-08', null, today)).toBe('Today')
    expect(dueLabel('2026-10-09', null, today)).toBe('Tomorrow')
    expect(dueLabel('2026-10-09', '17:00', today)).toMatch(/^Tomorrow · 5:00/)
    expect(dueLabel('2026-10-10', null, today)).toBe('Saturday')
    expect(dueLabel('2026-10-10', null, today, true)).toBe('Saturday · in 2 days')
    expect(dueLabel('2026-10-17', null, today)).toBe('In 9 days')
  })
})
