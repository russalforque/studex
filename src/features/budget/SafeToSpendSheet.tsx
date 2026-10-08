import type { ReactNode } from 'react'
import { useSettings } from '@/app/contexts'
import { Loading } from '@/components/ui/display'
import { Sheet } from '@/components/ui/Sheet'
import { useCurrentBudget } from '@/hooks/data'
import { cn } from '@/utils/cn'
import { formatMoney } from '@/utils/money'

function Line({ label, value, strong, muted }: { label: ReactNode; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-4 py-2.5', strong && 'border-t border-line pt-3.5')}>
      <dt className={cn('text-body', muted ? 'text-ink-2' : 'text-ink', strong && 'font-semibold')}>{label}</dt>
      <dd className={cn('tabular shrink-0 text-body', strong ? 'text-headline font-bold' : 'font-medium')}>{value}</dd>
    </div>
  )
}

/** Shows how "Safe to spend today" is worked out, step by step, with the student's own numbers. */
export function SafeToSpendSheet({ onClose }: { onClose: () => void }) {
  const { data: budget, isPending } = useCurrentBudget()
  const { currency } = useSettings()
  const m = (n: number) => formatMoney(n, currency)

  return (
    <Sheet open onClose={onClose} title="Safe to spend">
      {isPending ? (
        <Loading />
      ) : !budget ? (
        <p className="text-body text-ink-2">Set up your allowance to see how much you can safely spend each day.</p>
      ) : (
        (() => {
          const s = budget.summary
          const spentBefore = s.spent - s.spentToday
          return (
            <>
              <p className="mb-3 text-body text-ink-2">
                What's left is shared evenly across the spending days until your next allowance, so you don't run out early.
              </p>
              <dl>
                <Line label="Money this period" value={m(s.income)} />
                {s.saved !== 0 && (
                  <Line label={s.saved > 0 ? 'Set aside for savings' : 'Taken from savings'} value={s.saved > 0 ? `−${m(s.saved)}` : `+${m(-s.saved)}`} muted />
                )}
                <Line label="Spent before today" value={`−${m(spentBefore)}`} muted />
                <Line label="Left this morning" value={m(s.leftThisMorning)} strong />
                {s.reserved > 0 && <Line label="Set aside for planned expenses" value={`−${m(s.reserved)}`} muted />}
                <Line
                  label={`Shared over ${s.daysLeft} spending day${s.daysLeft === 1 ? '' : 's'}`}
                  value={`${m(s.dailyAllowance)} a day`}
                  muted
                />
                <Line label="Spent today" value={`−${m(s.spentToday)}`} muted />
                <Line label="Safe to spend today" value={m(s.safeToSpendToday)} strong />
              </dl>
              <p className="mt-4 text-footnote text-ink-3">
                Savings never count as spendable money. Spending days can be changed in Settings, for example to school days only.
                {s.reserved > 0 && " When you pay a planned expense, it's recorded as an expense instead of being set aside, so it's only counted once."}
                {s.overToday > 0 && ` You've spent ${m(s.overToday)} more than today's amount, so the days ahead get a little less.`}
              </p>
            </>
          )
        })()
      )}
    </Sheet>
  )
}
