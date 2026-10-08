import { CalendarDays, CircleHelp, ClipboardList, HandCoins, Pencil, PiggyBank, Plus, ReceiptText, Repeat, ShieldCheck, Wallet } from 'lucide-react'
import { useSettings } from '@/app/contexts'
import { Page } from '@/components/layout/Page'
import { Button } from '@/components/ui/Button'
import { CategoryBar, CategoryIcon } from '@/components/ui/CategoryIcon'
import { HeroCard, HeroPill } from '@/components/ui/HeroCard'
import { EmptyState, ErrorNotice, IconCircle, List, Loading, ProgressBar, Row, Section, SectionLink } from '@/components/ui/display'
import { periodNoun } from '@/domain/periods'
import { paceMessage } from '@/features/budget/budgetCopy'
import { ExpenseRow } from '@/features/budget/ExpenseRow'
import { PendingRecurring } from '@/features/budget/PendingRecurring'
import { useSheets } from '@/features/sheets/SheetsContext'
import { useCategoryTotals, useCurrentBudget, usePlanned, usePresets, useRecentExpenses, useSpendingTotals } from '@/hooks/data'
import { useClock } from '@/app/contexts'
import { useMediaQuery, WIDE } from '@/hooks/useMediaQuery'
import { cn } from '@/utils/cn'
import { endOfMonth, formatShortDate, startOfMonth } from '@/utils/dates'
import { formatMoney } from '@/utils/money'

export function BudgetPage() {
  const open = useSheets()
  const { data: budget, isPending, error, refetch } = useCurrentBudget()
  const wide = useMediaQuery(WIDE)

  const overview = (
    <>
      {budget ? <Overview /> : <NoPlan />}
      <Button size="lg" block className="mt-4" icon={<Plus className="size-5" aria-hidden />} onClick={() => open({ type: 'expense' })}>
        Add expense
      </Button>
      <PresetChips />
      <PendingRecurring />
      <Spending />
    </>
  )
  const activity = (
    <>
      <Recent />
      <Section title="Money">
        <List>
          <Row
            to="/budget/allowance"
            leading={<IconCircle icon={HandCoins} tone="mint" />}
            title="Allowance"
            subtitle={budget ? 'Plan, received and extra money' : 'Not set up'}
            chevron
          />
          <PlannedRow />
          <Row to="/budget/recurring" leading={<IconCircle icon={Repeat} tone="lilac" />} title="Recurring expenses" subtitle="Fare, load, rent" chevron />
          <Row to="/savings" leading={<IconCircle icon={PiggyBank} tone="pink" />} title="Savings goals" subtitle="What you're saving for" chevron />
          <Row to="/budget/history" leading={<IconCircle icon={ReceiptText} tone="sky" />} title="All expenses" subtitle="Search, filter and export" chevron />
        </List>
      </Section>
    </>
  )

  return (
    <Page title="Budget" wide={wide}>
      {isPending ? (
        <Loading />
      ) : error ? (
        <ErrorNotice message="Your budget couldn't be loaded." onRetry={() => void refetch()} />
      ) : wide ? (
        <div className="grid grid-cols-2 items-start gap-8">
          <div>{overview}</div>
          <div className="[&>section:first-child]:mt-0">{activity}</div>
        </div>
      ) : (
        <>
          {overview}
          {activity}
        </>
      )}
    </Page>
  )
}

/** Saved presets, one tap from a filled-in expense form. Nothing is recorded until Add is tapped. */
function PresetChips() {
  const open = useSheets()
  const { currency } = useSettings()
  const { data: presets = [] } = usePresets()
  if (presets.length === 0) return null
  return (
    <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar rail:mx-0 rail:px-0">
      {presets.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => open({ type: 'expense', preset: p })}
          aria-label={`Add ${p.name}, ${formatMoney(p.amount, currency)}`}
          className="press card inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full py-1 pr-4 pl-1 text-subhead font-semibold whitespace-nowrap active:bg-surface-2"
        >
          <CategoryIcon icon={p.categoryIcon} className="size-9" />
          <span>{p.name}</span>
          <span className="tabular text-ink-2">{formatMoney(p.amount, currency)}</span>
        </button>
      ))}
      <button
        type="button"
        onClick={() => open({ type: 'presets' })}
        aria-label="Edit presets"
        className="press card inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink-2 active:bg-surface-2"
      >
        <Pencil className="size-4" aria-hidden />
      </button>
    </div>
  )
}

function PlannedRow() {
  const { currency } = useSettings()
  const { data: planned = [] } = usePlanned()
  const upcoming = planned.filter((p) => !p.expenseId)
  const total = upcoming.reduce((n, p) => n + p.amount, 0)
  return (
    <Row
      to="/budget/planned"
      leading={<IconCircle icon={ClipboardList} tone="peach" />}
      title="School expenses"
      subtitle={upcoming.length ? `${formatMoney(total, currency)} planned · ${upcoming.length} upcoming` : 'Plan before you spend'}
      chevron
    />
  )
}

function NoPlan() {
  const open = useSheets()
  return (
    <HeroCard tone="pink" art={Wallet} data-tour="budget-overview">
      <p className="text-title-3 leading-tight font-bold">Set up your allowance</p>
      <p className="mt-1.5 text-subhead text-ink-2">
        Tell Studex how much you get and how often. It works out how much you can safely spend each day.
      </p>
      <Button className="mt-4" onClick={() => open({ type: 'allowance' })}>
        Set up allowance
      </Button>
    </HeroCard>
  )
}

function Overview() {
  const open = useSheets()
  const { data: budget } = useCurrentBudget()
  const { currency } = useSettings()
  const { today } = useClock()
  if (!budget) return null
  const { summary: s, plan, period } = budget
  const noun = periodNoun(plan.frequency)
  const msg = paceMessage(s, plan.frequency, currency)
  const usedPct = s.available > 0 ? (s.spent / s.available) * 100 : s.spent > 0 ? 100 : 0
  const tone = s.pace === 'over' ? 'danger' : s.pace === 'fast' ? 'warn' : 'accent'

  return (
    <div>
      <HeroCard
        tone="pink"
        art={Wallet}
        data-tour="budget-overview"
        footer={
          <>
            <div className="tabular mb-2 flex items-baseline justify-between gap-3 text-footnote text-ink-2">
              <span>
                Spent <span className="font-semibold text-ink">{formatMoney(s.spent, currency)}</span>
              </span>
              <span>of {formatMoney(s.available, currency)}</span>
            </div>
            <ProgressBar value={usedPct} tone={tone} onColor label={`Spent ${Math.round(usedPct)}% of your budget`} />
          </>
        }
      >
        <HeroPill icon={CalendarDays}>{plan.frequency === 'daily' ? 'Today' : `Until ${formatShortDate(period.end, today)}`}</HeroPill>
        <p className={cn('tabular mt-4 text-display leading-none font-bold', s.remaining < 0 && 'text-danger')}>
          {formatMoney(s.remaining, currency)}
        </p>
        <p className="mt-1.5 text-subhead text-ink-2">left {noun}</p>
      </HeroCard>

      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={() => open({ type: 'safeToSpend' })}
          aria-label={`Safe to spend today: ${formatMoney(s.safeToSpendToday, currency)}. How is this worked out?`}
          className="card press rounded-[26px] p-4 text-left active:bg-surface-2"
        >
          <span className="flex items-center gap-2 text-footnote font-medium text-ink-2">
            <ShieldCheck className="size-4 text-mint-ink" aria-hidden />
            Safe today
            <CircleHelp className="ml-auto size-4 text-ink-3" aria-hidden />
          </span>
          <span className="tabular mt-1.5 block text-title-3 font-bold">{formatMoney(s.safeToSpendToday, currency)}</span>
        </button>
        <div className="card rounded-[26px] p-4">
          <div className="flex items-center gap-2 text-footnote font-medium text-ink-2">
            <CalendarDays className="size-4 text-sky-ink" aria-hidden />
            Days left
          </div>
          <p className="tabular mt-1.5 text-title-3 font-bold">
            {plan.frequency === 'daily' ? 1 : s.daysLeft}
            <span className="text-footnote font-medium text-ink-2"> incl. today</span>
          </p>
        </div>
      </div>

      {msg && (
        <p className={cn('mt-3 rounded-2xl px-4 py-3 text-subhead', msg.tone === 'warn' ? 'bg-warn-soft text-warn' : 'card text-ink-2')}>
          {msg.text}
        </p>
      )}
      {s.reserved > 0 && (
        <p className="mt-3 px-1 text-footnote text-ink-3">
          {formatMoney(s.reserved, currency)} set aside for planned school expenses, so it's left out of Safe to spend.
        </p>
      )}
      {s.saved !== 0 && (
        <p className="mt-3 px-1 text-footnote text-ink-3">
          {s.saved > 0
            ? `${formatMoney(s.saved, currency)} set aside for savings ${noun}`
            : `${formatMoney(-s.saved, currency)} taken from savings ${noun}`}
        </p>
      )}
    </div>
  )
}

function Spending() {
  const { today } = useClock()
  const { currency } = useSettings()
  const { data: totals } = useSpendingTotals()
  const { data: budget } = useCurrentBudget()
  const from = budget?.period.start ?? startOfMonth(today)
  const to = budget?.period.end ?? endOfMonth(today)
  const { data: byCategory = [] } = useCategoryTotals(from, to)
  if (!totals) return null
  const max = byCategory[0]?.total ?? 0
  const top = byCategory.slice(0, 5)
  const restTotal = byCategory.slice(5).reduce((n, c) => n + c.total, 0)

  return (
    <Section title="Spending">
      <dl className="grid grid-cols-3 gap-2">
        {[
          ['Today', totals.day],
          ['This week', totals.week],
          ['This month', totals.month],
        ].map(([label, value]) => (
          <div key={label as string} className="card rounded-3xl px-3.5 py-3">
            <dt className="text-caption font-medium text-ink-2">{label}</dt>
            <dd className="tabular mt-0.5 truncate text-body font-bold">{formatMoney(value as number, currency)}</dd>
          </div>
        ))}
      </dl>
      {top.length > 0 && (
        <div className="mt-5">
          <p className="mb-2.5 px-1 text-footnote font-medium text-ink-2">
            By category · {budget ? periodNoun(budget.plan.frequency) : 'this month'}
          </p>
          <ul className="flex flex-col gap-2.5">
            {top.map((c) => (
              <li key={c.categoryId} className="card flex items-center gap-3 rounded-[26px] py-2.5 pr-4 pl-2.5">
                <CategoryIcon icon={c.icon} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-body font-semibold">{c.name}</span>
                    <span className="tabular shrink-0 text-body font-semibold">{formatMoney(c.total, currency)}</span>
                  </div>
                  <div className="mt-2">
                    <CategoryBar icon={c.icon} value={max ? (c.total / max) * 100 : 0} />
                  </div>
                </div>
              </li>
            ))}
            {restTotal > 0 && (
              <li className="flex justify-between px-4 py-1 text-subhead text-ink-2">
                <span>Everything else</span>
                <span className="tabular">{formatMoney(restTotal, currency)}</span>
              </li>
            )}
          </ul>
        </div>
      )}
    </Section>
  )
}

function Recent() {
  const { data: recent } = useRecentExpenses(5)
  const open = useSheets()
  if (!recent) return null
  return (
    <Section title="Recent" action={recent.length ? <SectionLink to="/budget/history">See all</SectionLink> : undefined}>
      {recent.length === 0 ? (
        <EmptyState
          compact
          icon={ReceiptText}
          tone="peach"
          title="No expenses yet"
          message="Add what you spend and your budget updates instantly."
          action={{ label: 'Add expense', onClick: () => open({ type: 'expense' }) }}
        />
      ) : (
        <List>
          {recent.map((e) => (
            <ExpenseRow key={e.id} expense={e} />
          ))}
        </List>
      )}
    </Section>
  )
}
