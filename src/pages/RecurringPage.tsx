import { Plus, Repeat } from 'lucide-react'
import { useClock, useSettings } from '@/app/contexts'
import { Page } from '@/components/layout/Page'
import { IconButton } from '@/components/ui/Button'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import { EmptyState, ErrorNotice, List, Loading, MetaChip, Row, Section } from '@/components/ui/display'
import { frequencyLabel, nextOccurrence } from '@/domain/recurring'
import { PendingRecurring } from '@/features/budget/PendingRecurring'
import { useSheets } from '@/features/sheets/SheetsContext'
import { useLastRecorded, useRecurring } from '@/hooks/data'
import type { RecurringExpense } from '@/types/models'
import { relativeDay } from '@/utils/dates'
import { formatMoney } from '@/utils/money'

/** Fares, load, rent: expenses that repeat, recorded automatically or after a tap. */
export function RecurringPage() {
  const open = useSheets()
  const { today } = useClock()
  const { currency } = useSettings()
  const { data: rules, isPending, error, refetch } = useRecurring()
  const { data: last } = useLastRecorded()

  const subtitle = (r: RecurringExpense) => {
    const next = r.active ? nextOccurrence(r, today) : null
    return (
      <span className="flex flex-wrap gap-1.5 pt-0.5">
        <MetaChip>{frequencyLabel(r.frequency, r.intervalDays)}</MetaChip>
        {!r.active ? (
          <MetaChip tone="warn">Paused</MetaChip>
        ) : next ? (
          <MetaChip>Next: {relativeDay(next, today)}</MetaChip>
        ) : (
          <MetaChip>Ended</MetaChip>
        )}
        <MetaChip tone={r.mode === 'auto' ? 'lilac' : 'neutral'}>{r.mode === 'auto' ? 'Automatic' : 'Asks first'}</MetaChip>
        {last?.get(r.id) && <span className="text-caption text-ink-3">Last: {relativeDay(last.get(r.id)!, today)}</span>}
      </span>
    )
  }

  return (
    <Page
      title="Recurring expenses"
      back
      actions={
        <IconButton label="Add recurring expense" tone="accent" onClick={() => open({ type: 'recurring' })}>
          <Plus className="size-5" />
        </IconButton>
      }
    >
      <PendingRecurring />
      {isPending ? (
        <Loading />
      ) : error ? (
        <ErrorNotice message="Your recurring expenses couldn't be loaded." onRetry={() => void refetch()} />
      ) : rules.length === 0 ? (
        <EmptyState
          icon={Repeat}
          tone="sky"
          title="Nothing recurring yet"
          message="Add daily fare, weekly load or monthly rent once. Studex records it on each date, or asks you first."
          action={{ label: 'Add recurring expense', onClick: () => open({ type: 'recurring' }) }}
        />
      ) : (
        <Section title="All recurring">
          <List>
            {rules.map((r) => (
              <Row
                key={r.id}
                onClick={() => open({ type: 'recurring', recurring: r })}
                leading={<CategoryIcon icon={r.categoryIcon} />}
                title={r.name}
                subtitle={subtitle(r)}
                trailing={<span className="tabular text-body font-semibold">{formatMoney(r.amount, currency)}</span>}
                className={r.active ? undefined : 'opacity-70'}
              />
            ))}
          </List>
          <p className="mt-4 px-1 text-footnote text-ink-3">
            Studex catches up when you open it, so nothing is missed or added twice even if the app was closed for days.
          </p>
        </Section>
      )}
    </Page>
  )
}
