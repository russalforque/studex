import { useState } from 'react'
import { useParams } from 'react-router'
import { ArrowDownLeft, ArrowUpRight, Minus, Pencil, PiggyBank, Plus, Target } from 'lucide-react'
import { useClock, useRepos, useSettings } from '@/app/contexts'
import { Columns } from '@/components/layout/Columns'
import { Page } from '@/components/layout/Page'
import { Button, IconButton } from '@/components/ui/Button'
import { ConfirmSheet } from '@/components/ui/ConfirmSheet'
import { HeroCard, HeroPill } from '@/components/ui/HeroCard'
import { ErrorNotice, IconCircle, List, Loading, ProgressBar, Row, Section } from '@/components/ui/display'
import { monthlyNeeded, progressPercent } from '@/domain/savings'
import { useSheets } from '@/features/sheets/SheetsContext'
import { useGoal, useGoalTransactions } from '@/hooks/data'
import { useMediaQuery, WIDE } from '@/hooks/useMediaQuery'
import { MONEY } from '@/hooks/queryKeys'
import { useAction } from '@/hooks/useAction'
import type { SavingsTransaction } from '@/types/models'
import { formatDate, formatShortDate } from '@/utils/dates'
import { formatMoney } from '@/utils/money'

const SOURCE_LABEL: Record<SavingsTransaction['source'], string> = {
  manual: '',
  allowance: 'From allowance',
  initial: 'Starting amount',
}

export function GoalDetailPage() {
  const { id = '' } = useParams()
  const repos = useRepos()
  const open = useSheets()
  const { currency } = useSettings()
  const { today } = useClock()
  const { data: goal, isPending, error } = useGoal(id)
  const { data: txs = [] } = useGoalTransactions(id)
  const wide = useMediaQuery(WIDE)
  const [removing, setRemoving] = useState<SavingsTransaction | null>(null)
  const remove = useAction((txId: string) => repos.savings.deleteTransaction(txId), MONEY, { success: 'Entry removed' })

  if (isPending) {
    return (
      <Page back="/savings">
        <Loading />
      </Page>
    )
  }
  if (error || !goal) {
    return (
      <Page back="/savings">
        <ErrorNotice message="This goal could not be found. It may have been deleted." />
      </Page>
    )
  }

  const pct = progressPercent(goal.balance, goal.target)
  const perMonth = monthlyNeeded(goal.balance, goal.target, goal.targetDate, today)
  const reached = goal.balance >= goal.target

  return (
    <Page
      back="/savings"
      title={goal.name}
      wide={wide}
      actions={
        <IconButton label="Edit goal" onClick={() => open({ type: 'goal', goal })}>
          <Pencil className="size-4.5" />
        </IconButton>
      }
    >
      <Columns wide={wide} primary={
        <>
          <HeroCard
            tone="mint"
            art={PiggyBank}
            footer={
              <>
                <ProgressBar value={pct} tone={reached ? 'ok' : 'accent'} onColor label={`${pct}% of goal saved`} />
                <p className="mt-3 text-footnote font-medium text-ink-2">
                  {reached
                    ? 'Goal reached. Nice work!'
                    : goal.targetDate
                      ? `Target ${formatDate(goal.targetDate, { month: 'long', year: 'numeric' })}${perMonth ? ` · about ${formatMoney(perMonth, currency)} a month` : ''}`
                      : `${formatMoney(goal.target - goal.balance, currency)} to go`}
                </p>
              </>
            }
          >
            <HeroPill icon={Target}>
              {pct}% of {formatMoney(goal.target, currency)}
            </HeroPill>
            <p className="tabular mt-4 text-display leading-none font-bold">{formatMoney(goal.balance, currency)}</p>
            <p className="mt-1.5 text-subhead text-ink-2">saved so far</p>
          </HeroCard>

          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <Button size="lg" icon={<Plus className="size-5" aria-hidden />} onClick={() => open({ type: 'savingsTx', goal, kind: 'deposit' })}>
              Add money
            </Button>
            <Button
              size="lg"
              variant="secondary"
              disabled={goal.balance <= 0}
              icon={<Minus className="size-5" aria-hidden />}
              onClick={() => open({ type: 'savingsTx', goal, kind: 'withdrawal' })}
            >
              Withdraw
            </Button>
          </div>
        </>
      } secondary={
          <Section title="History">
            {txs.length === 0 ? (
              <p className="px-1 py-2 text-subhead text-ink-3">No money added yet.</p>
            ) : (
              <List>
                {txs.map((t) => (
                  <Row
                    key={t.id}
                    onClick={() => setRemoving(t)}
                    leading={<IconCircle icon={t.kind === 'deposit' ? ArrowDownLeft : ArrowUpRight} tone={t.kind === 'deposit' ? 'mint' : 'peach'} />}
                    title={t.note && t.source === 'manual' ? t.note : t.kind === 'deposit' ? SOURCE_LABEL[t.source] || 'Added' : 'Withdrawn'}
                    subtitle={formatShortDate(t.occurredOn, today)}
                    trailing={
                      <span className={`tabular text-body font-semibold ${t.kind === 'deposit' ? 'text-ok' : ''}`}>
                        {formatMoney(t.kind === 'deposit' ? t.amount : -t.amount, currency, { signed: true })}
                      </span>
                    }
                  />
                ))}
              </List>
            )}
          </Section>
      } />

      <ConfirmSheet
        open={!!removing}
        title="Remove this entry?"
        message={
          removing
            ? `${removing.kind === 'deposit' ? 'Deposit' : 'Withdrawal'} of ${formatMoney(removing.amount, currency)} on ${formatShortDate(removing.occurredOn, today)} will be removed and the balance recalculated.`
            : ''
        }
        confirmLabel="Remove entry"
        onConfirm={() => remove.run((removing?.id ?? ""))}
        onClose={() => setRemoving(null)}
      />
    </Page>
  )
}
