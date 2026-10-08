import { useState } from 'react'
import { ChevronLeft, ChevronRight, Download, ReceiptText, Search } from 'lucide-react'
import { useClock, useSettings } from '@/app/contexts'
import { Page } from '@/components/layout/Page'
import { IconButton } from '@/components/ui/Button'
import { Chips } from '@/components/ui/choice'
import { EmptyState, ErrorNotice, List, Loading, MetaChip, Section } from '@/components/ui/display'
import { TextInput } from '@/components/ui/fields'
import { useToast } from '@/components/ui/Toast'
import { ExpenseRow } from '@/features/budget/ExpenseRow'
import { useExpensesRange } from '@/hooks/data'
import { errorMessage } from '@/repositories/errors'
import { shareTextFile, toCsv } from '@/services/files'
import type { Expense } from '@/types/models'
import { addMonthsClamped, endOfMonth, formatDate, relativeDay, startOfMonth } from '@/utils/dates'
import { formatMoney, minorToInput } from '@/utils/money'

export function ExpenseHistoryPage() {
  const { today } = useClock()
  const { currency } = useSettings()
  const toast = useToast()
  const [month, setMonth] = useState(startOfMonth(today))
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const { data: expenses, isPending, error, refetch } = useExpensesRange(month, endOfMonth(month))
  const isCurrent = month === startOfMonth(today)

  // Categories used this month, most spent first, as quick filters.
  const totals = new Map<string, { name: string; total: number }>()
  for (const e of expenses ?? []) {
    const t = totals.get(e.categoryId) ?? { name: e.categoryName, total: 0 }
    t.total += e.amount
    totals.set(e.categoryId, t)
  }
  const categories = [...totals].sort((a, b) => b[1].total - a[1].total)
  const activeCategory = category === 'all' || totals.has(category) ? category : 'all'

  const q = query.trim().toLowerCase()
  const visible = (expenses ?? []).filter(
    (e) =>
      (activeCategory === 'all' || e.categoryId === activeCategory) &&
      (!q || (e.description ?? '').toLowerCase().includes(q) || e.categoryName.toLowerCase().includes(q)),
  )
  const filtered = activeCategory !== 'all' || q !== ''

  const byDay = new Map<string, Expense[]>()
  for (const e of visible) byDay.set(e.spentOn, [...(byDay.get(e.spentOn) ?? []), e])
  const total = visible.reduce((n, e) => n + e.amount, 0)
  const monthName = formatDate(month, { month: 'long', year: 'numeric' })

  const changeMonth = (delta: number) => {
    setMonth(addMonthsClamped(month, delta))
    setCategory('all')
  }

  const exportMonth = async () => {
    try {
      const csv = toCsv(
        ['Date', 'Amount', 'Category', 'Note'],
        [...visible].reverse().map((e) => [e.spentOn, minorToInput(e.amount), e.categoryName, e.description]),
      )
      const outcome = await shareTextFile(`studex-expenses-${month.slice(0, 7)}.csv`, csv, 'text/csv')
      if (outcome === 'downloaded') toast('Expenses downloaded')
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  return (
    <Page
      title="All expenses"
      back="/budget"
      actions={
        visible.length > 0 && (
          <IconButton label={`Export ${monthName} as CSV`} onClick={() => void exportMonth()}>
            <Download className="size-5" />
          </IconButton>
        )
      }
    >
      <div className="hero-sky mb-4 flex items-center justify-between gap-2 rounded-full p-1.5">
        <IconButton label="Previous month" onClick={() => changeMonth(-1)}>
          <ChevronLeft className="size-5" />
        </IconButton>
        <div className="min-w-0 text-center">
          <p className="truncate text-callout font-bold">{monthName}</p>
          <p className="tabular text-footnote text-ink-2">
            {formatMoney(total, currency)} {filtered ? 'shown' : 'spent'}
          </p>
        </div>
        <IconButton label="Next month" disabled={isCurrent} className="disabled:opacity-30" onClick={() => changeMonth(1)}>
          <ChevronRight className="size-5" />
        </IconButton>
      </div>

      {(expenses?.length ?? 0) > 0 && (
        <div className="mb-2 flex flex-col gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-4 size-4.5 -translate-y-1/2 text-ink-3" aria-hidden />
            <TextInput
              type="search"
              aria-label="Search expenses"
              placeholder="Search notes and categories"
              className="pl-11"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {categories.length > 1 && (
            <Chips
              label="Category"
              value={activeCategory}
              onChange={setCategory}
              options={[{ value: 'all', label: 'All' }, ...categories.map(([id, c]) => ({ value: id, label: c.name }))]}
            />
          )}
        </div>
      )}

      {isPending ? (
        <Loading />
      ) : error ? (
        <ErrorNotice message="Expenses couldn't be loaded." onRetry={() => void refetch()} />
      ) : byDay.size === 0 ? (
        <div className="mt-5">
          <EmptyState icon={ReceiptText} tone="sky" title={filtered ? 'No matching expenses' : 'No expenses this month'} />
        </div>
      ) : (
        [...byDay].map(([day, list]) => (
          <Section
            key={day}
            title={relativeDay(day, today)}
            action={<MetaChip>{formatMoney(list.reduce((n, e) => n + e.amount, 0), currency)}</MetaChip>}
          >
            <List>
              {list.map((e) => (
                <ExpenseRow key={e.id} expense={e} showDate={false} />
              ))}
            </List>
          </Section>
        ))
      )}
    </Page>
  )
}
