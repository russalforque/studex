import { useState } from 'react'
import { ChevronLeft, ChevronRight, ReceiptText } from 'lucide-react'
import { useClock, useSettings } from '@/app/contexts'
import { Page } from '@/components/layout/Page'
import { IconButton } from '@/components/ui/Button'
import { EmptyState, ErrorNotice, List, Loading, MetaChip, Section } from '@/components/ui/display'
import { ExpenseRow } from '@/features/budget/ExpenseRow'
import { useExpensesRange } from '@/hooks/data'
import type { Expense } from '@/types/models'
import { addMonthsClamped, endOfMonth, formatDate, relativeDay, startOfMonth } from '@/utils/dates'
import { formatMoney } from '@/utils/money'

export function ExpenseHistoryPage() {
  const { today } = useClock()
  const { currency } = useSettings()
  const [month, setMonth] = useState(startOfMonth(today))
  const { data: expenses, isPending, error, refetch } = useExpensesRange(month, endOfMonth(month))
  const isCurrent = month === startOfMonth(today)

  const byDay = new Map<string, Expense[]>()
  for (const e of expenses ?? []) byDay.set(e.spentOn, [...(byDay.get(e.spentOn) ?? []), e])
  const total = (expenses ?? []).reduce((n, e) => n + e.amount, 0)

  return (
    <Page title="All expenses" back="/budget">
      <div className="hero-sky mb-2 flex items-center justify-between gap-2 rounded-full p-1.5">
        <IconButton label="Previous month" onClick={() => setMonth(addMonthsClamped(month, -1))}>
          <ChevronLeft className="size-5" />
        </IconButton>
        <div className="min-w-0 text-center">
          <p className="truncate text-[16px] font-bold">{formatDate(month, { month: 'long', year: 'numeric' })}</p>
          <p className="tabular text-[13px] text-ink-2">{formatMoney(total, currency)} spent</p>
        </div>
        <IconButton label="Next month" disabled={isCurrent} className="disabled:opacity-30" onClick={() => setMonth(addMonthsClamped(month, 1))}>
          <ChevronRight className="size-5" />
        </IconButton>
      </div>
      {isPending ? (
        <Loading />
      ) : error ? (
        <ErrorNotice message="Expenses couldn't be loaded." onRetry={() => void refetch()} />
      ) : byDay.size === 0 ? (
        <div className="mt-5">
          <EmptyState icon={ReceiptText} tone="sky" title="No expenses this month" />
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
