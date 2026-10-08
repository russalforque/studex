import { ClipboardList, Plus } from 'lucide-react'
import { useClock, useSettings } from '@/app/contexts'
import { Page } from '@/components/layout/Page'
import { IconButton } from '@/components/ui/Button'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import { EmptyState, ErrorNotice, List, Loading, MetaChip, Pill, Row, Section } from '@/components/ui/display'
import { useSheets } from '@/features/sheets/SheetsContext'
import { useCurrentBudget, usePlanned } from '@/hooks/data'
import { dueLabel, formatShortDate } from '@/utils/dates'
import { formatMoney } from '@/utils/money'

/** Upcoming school expenses: what's coming, what's set aside, and what's been paid. */
export function PlannedPage() {
  const open = useSheets()
  const { today } = useClock()
  const { currency } = useSettings()
  const { data: planned, isPending, error, refetch } = usePlanned()
  const { data: budget } = useCurrentBudget()

  const upcoming = (planned ?? []).filter((p) => !p.expenseId)
  const paid = (planned ?? []).filter((p) => p.expenseId)
  const total = upcoming.reduce((n, p) => n + p.amount, 0)
  const reserved = budget?.summary.reserved ?? 0

  return (
    <Page
      title="School expenses"
      back
      actions={
        <IconButton label="Plan an expense" tone="accent" onClick={() => open({ type: 'planned' })}>
          <Plus className="size-5" />
        </IconButton>
      }
    >
      {isPending ? (
        <Loading />
      ) : error ? (
        <ErrorNotice message="Your planned expenses couldn't be loaded." onRetry={() => void refetch()} />
      ) : upcoming.length === 0 && paid.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          tone="peach"
          title="Plan ahead"
          message="Add project materials, printing or event fees before you pay. Studex sets the money aside so you don't spend it by accident."
          action={{ label: 'Plan an expense', onClick: () => open({ type: 'planned' }) }}
        />
      ) : (
        <>
          {upcoming.length > 0 && (
            <dl className="grid grid-cols-2 gap-2.5">
              <div className="card rounded-[26px] p-4">
                <dt className="text-footnote font-medium text-ink-2">Total planned</dt>
                <dd className="tabular mt-1 text-title-2 font-bold">{formatMoney(total, currency)}</dd>
              </div>
              <div className="card rounded-[26px] p-4">
                <dt className="text-footnote font-medium text-ink-2">Set aside now</dt>
                <dd className="tabular mt-1 text-title-2 font-bold">{formatMoney(reserved, currency)}</dd>
              </div>
            </dl>
          )}
          {upcoming.length > 0 && (
            <p className="mt-2.5 px-1 text-footnote text-ink-3">
              {budget
                ? "Money set aside is left out of Safe to spend until you've paid. Expenses due after this budget period aren't set aside yet."
                : 'Set up your allowance to have Studex set money aside for these.'}
            </p>
          )}
          <Section title="Upcoming" count={upcoming.length}>
            {upcoming.length === 0 ? (
              <p className="px-1 text-subhead text-ink-3">Nothing coming up.</p>
            ) : (
              <List>
                {upcoming.map((p) => {
                  const overdue = !!p.dueDate && p.dueDate < today
                  return (
                    <Row
                      key={p.id}
                      onClick={() => open({ type: 'planned', planned: p })}
                      leading={<CategoryIcon icon={p.categoryIcon} />}
                      title={p.title}
                      subtitle={
                        <span className="flex flex-wrap gap-1.5 pt-0.5">
                          {p.dueDate && <MetaChip tone={overdue ? 'danger' : 'neutral'}>{overdue ? `Overdue · ${formatShortDate(p.dueDate, today)}` : dueLabel(p.dueDate, null, today)}</MetaChip>}
                          {p.subjectName && <MetaChip>{p.subjectName}</MetaChip>}
                          {!p.reserve && <MetaChip>Not set aside</MetaChip>}
                        </span>
                      }
                      trailing={<span className="tabular text-body font-semibold">{formatMoney(p.amount, currency)}</span>}
                      chevron
                    />
                  )
                })}
              </List>
            )}
          </Section>
          {paid.length > 0 && (
            <Section title="Paid recently">
              <List>
                {paid.map((p) => (
                  <Row
                    key={p.id}
                    onClick={() => open({ type: 'planned', planned: p })}
                    leading={<CategoryIcon icon={p.categoryIcon} />}
                    title={p.title}
                    subtitle={p.paidOn ? `Paid ${formatShortDate(p.paidOn, today)}` : 'Paid'}
                    trailing={
                      <span className="flex flex-col items-end gap-1">
                        <span className="tabular text-body font-semibold">{formatMoney(p.paidAmount ?? p.amount, currency)}</span>
                        <Pill tone="ok">Paid</Pill>
                      </span>
                    }
                  />
                ))}
              </List>
            </Section>
          )}
        </>
      )}
    </Page>
  )
}
