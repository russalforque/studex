import { useState } from 'react'
import { useClock, useRepos, useSettings } from '@/app/contexts'
import { Button } from '@/components/ui/Button'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import { Section } from '@/components/ui/display'
import { Field, MoneyInput } from '@/components/ui/fields'
import { Sheet } from '@/components/ui/Sheet'
import { usePendingRecurring } from '@/hooks/data'
import { MONEY } from '@/hooks/queryKeys'
import { useAction } from '@/hooks/useAction'
import type { PendingOccurrence } from '@/types/models'
import { formatShortDate, relativeDay } from '@/utils/dates'
import { formatMoney, minorToInput, parseMoney } from '@/utils/money'

const SHOWN = 4

/**
 * Recurring expenses set to "ask me first" whose dates have come. Each is recorded or skipped
 * by the student; nothing is added without a tap.
 */
export function PendingRecurring() {
  const repos = useRepos()
  const { today } = useClock()
  const { currency } = useSettings()
  const { data: pending = [] } = usePendingRecurring()
  const [adjusting, setAdjusting] = useState<PendingOccurrence | null>(null)
  const [showAll, setShowAll] = useState(false)
  const confirm = useAction((p: PendingOccurrence, amount?: number) => repos.recurring.confirm(p.recurring.id, p.date, amount), MONEY, {
    success: 'Expense recorded',
  })
  const skip = useAction((p: PendingOccurrence) => repos.recurring.skip(p.recurring.id, p.date), MONEY)
  const recordAll = useAction(
    async () => {
      for (const p of pending) await repos.recurring.confirm(p.recurring.id, p.date)
    },
    MONEY,
    { success: 'All recorded' },
  )
  if (pending.length === 0) return null
  const shown = showAll ? pending : pending.slice(0, SHOWN)
  const busy = confirm.pending || skip.pending || recordAll.pending

  return (
    <Section
      title="Waiting for you"
      count={pending.length}
      action={
        pending.length > 1 ? (
          <Button variant="secondary" className="min-h-9 px-3.5 text-footnote" loading={recordAll.pending} disabled={busy} onClick={() => recordAll.fire()}>
            Record all
          </Button>
        ) : undefined
      }
    >
      <ul className="flex flex-col gap-2.5">
        {shown.map((p) => (
          <li key={`${p.recurring.id}|${p.date}`} className="card flex items-center gap-3 rounded-[26px] py-2.5 pr-2.5 pl-2.5">
            <CategoryIcon icon={p.recurring.categoryIcon} />
            <button type="button" onClick={() => setAdjusting(p)} className="press min-w-0 flex-1 text-left" aria-label={`Change the amount for ${p.recurring.name}`}>
              <span className="block truncate text-body font-semibold">{p.recurring.name}</span>
              <span className="tabular block truncate text-footnote text-ink-2">
                {formatMoney(p.recurring.amount, currency)} · {relativeDay(p.date, today)}
              </span>
            </button>
            <Button variant="ghost" className="min-h-10 px-3 text-subhead text-ink-2" disabled={busy} onClick={() => skip.fire(p)}>
              Skip
            </Button>
            <Button className="min-h-10 px-4 text-subhead" disabled={busy} onClick={() => confirm.fire(p)}>
              Record
            </Button>
          </li>
        ))}
      </ul>
      {pending.length > SHOWN && (
        <button type="button" onClick={() => setShowAll((s) => !s)} className="press mt-2 min-h-10 w-full text-subhead font-semibold text-ink-2">
          {showAll ? 'Show less' : `Show all ${pending.length}`}
        </button>
      )}
      {adjusting && (
        <AdjustSheet
          pending={adjusting}
          onRecord={async (amount) => {
            await confirm.run(adjusting, amount)
            setAdjusting(null)
          }}
          onClose={() => setAdjusting(null)}
        />
      )}
    </Section>
  )
}

function AdjustSheet({ pending, onRecord, onClose }: { pending: PendingOccurrence; onRecord: (amount: number) => Promise<void>; onClose: () => void }) {
  const { currency } = useSettings()
  const { today } = useClock()
  const [amount, setAmount] = useState(minorToInput(pending.recurring.amount))
  const [error, setError] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    const minor = parseMoney(amount)
    if (!minor) return setError('Enter an amount')
    setBusy(true)
    try {
      await onRecord(minor)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet
      open
      onClose={onClose}
      title={pending.recurring.name}
      footer={
        <Button size="lg" block loading={busy} onClick={submit}>
          Record
        </Button>
      }
    >
      <p className="mb-4 text-subhead text-ink-2">Due {formatShortDate(pending.date, today)}. Change the amount if it was different this time.</p>
      <Field label="Amount" error={error}>
        {(id, d) => (
          <MoneyInput
            id={id}
            aria-describedby={d}
            large
            autoFocus
            currency={currency}
            value={amount}
            invalid={!!error}
            onChange={(e) => {
              setAmount(e.target.value)
              setError(undefined)
            }}
          />
        )}
      </Field>
    </Sheet>
  )
}
