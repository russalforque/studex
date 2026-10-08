import { CalendarDays, HandCoins, Pencil, PiggyBank, Plus, Repeat } from 'lucide-react'
import { useClock, useSettings } from '@/app/contexts'
import { Columns } from '@/components/layout/Columns'
import { Page } from '@/components/layout/Page'
import { IconButton } from '@/components/ui/Button'
import { HeroCard, HeroPill } from '@/components/ui/HeroCard'
import { EmptyState, IconCircle, List, Loading, MetaChip, Row, Section, SectionButton } from '@/components/ui/display'
import { FREQUENCY_LABEL } from '@/features/budget/allowanceForm'
import { useSheets } from '@/features/sheets/SheetsContext'
import { useAllowancePlan, useCurrentBudget, useGoals, useIncome } from '@/hooks/data'
import { useMediaQuery, WIDE } from '@/hooks/useMediaQuery'
import { formatShortDate, WEEKDAYS_LONG, dayOfWeek } from '@/utils/dates'
import { formatMoney } from '@/utils/money'
import type { AllowancePlan } from '@/types/models'

function planSchedule(plan: AllowancePlan): string {
  switch (plan.frequency) {
    case 'weekly':
      return `Every ${WEEKDAYS_LONG[dayOfWeek(plan.anchorDate)]}`
    case 'monthly':
      return `Every month on day ${Number(plan.anchorDate.slice(8))}`
    case 'custom':
      return `Every ${plan.intervalDays} days`
    default:
      return FREQUENCY_LABEL[plan.frequency]
  }
}

export function AllowancePage() {
  const open = useSheets()
  const { currency } = useSettings()
  const { today } = useClock()
  const { data: plan, isPending } = useAllowancePlan()
  const { data: budget } = useCurrentBudget()
  const { data: income = [] } = useIncome()
  const { data: goals = [] } = useGoals()
  const wide = useMediaQuery(WIDE)
  const goalName = plan?.savingsGoalId ? goals.find((g) => g.id === plan.savingsGoalId)?.name : null

  return (
    <Page
      title="Allowance"
      back="/budget"
      wide={wide}
      actions={
        plan ? (
          <IconButton label="Edit allowance" onClick={() => open({ type: 'allowance' })}>
            <Pencil className="size-4.5" />
          </IconButton>
        ) : undefined
      }
    >
      <Columns wide={wide} primary={
        <>
          {isPending ? (
            <Loading />
          ) : !plan ? (
            <EmptyState
              icon={HandCoins}
              tone="mint"
              title="No allowance set up"
              message="Add your allowance to see how much is safe to spend each day."
              action={{ label: 'Set up allowance', onClick: () => open({ type: 'allowance' }) }}
            />
          ) : (
            <>
              <HeroCard tone="mint" art={HandCoins}>
                <HeroPill icon={Repeat}>{planSchedule(plan)}</HeroPill>
                <p className="tabular mt-4 text-display leading-none font-bold">{formatMoney(plan.amount, currency)}</p>
                <p className="mt-1.5 text-subhead text-ink-2">{FREQUENCY_LABEL[plan.frequency]} allowance</p>
                {plan.savingsAmount > 0 && (
                  <div className="mt-3">
                    <MetaChip icon={PiggyBank} tone="onColor">
                      {formatMoney(plan.savingsAmount, currency)} saved each time{goalName ? ` · ${goalName}` : ''}
                    </MetaChip>
                  </div>
                )}
              </HeroCard>

              {budget && (
                <Section
                  title="This period"
                  action={
                    <MetaChip icon={CalendarDays}>
                      {formatShortDate(budget.period.start, today)} – {formatShortDate(budget.period.end, today)}
                    </MetaChip>
                  }
                >
                  <dl className="card rounded-[28px] px-4 py-1 text-body">
                    {[
                      ['Total allowance', budget.summary.income],
                      ['Savings', -budget.summary.saved],
                      ['Available to spend', budget.summary.available],
                      ['Spent', -budget.summary.spent],
                    ].map(([label, value]) => (
                      <div key={label as string} className="flex justify-between border-b border-line py-3">
                        <dt className="text-ink-2">{label}</dt>
                        <dd className="tabular font-medium">{formatMoney(value as number, currency)}</dd>
                      </div>
                    ))}
                    <div className="flex justify-between py-3.5 font-bold">
                      <dt>Remaining</dt>
                      <dd className="tabular">{formatMoney(budget.summary.remaining, currency)}</dd>
                    </div>
                  </dl>
                </Section>
              )}
            </>
          )}
        </>
      } secondary={
          <Section
            title="Received"
            action={
              <SectionButton icon={<Plus className="size-3.5" aria-hidden />} onClick={() => open({ type: 'income' })}>
                Extra money
              </SectionButton>
            }
          >
            {income.length === 0 ? (
              <p className="px-1 py-3 text-subhead text-ink-3">Allowances you receive will be listed here.</p>
            ) : (
              <List>
                {income.map((i) => (
                  <Row
                    key={i.id}
                    onClick={() => open({ type: 'income', income: i })}
                    leading={<IconCircle icon={i.kind === 'scheduled' ? Repeat : HandCoins} tone={i.kind === 'scheduled' ? 'mint' : 'sun'} />}
                    title={i.kind === 'scheduled' ? 'Allowance' : i.note || 'Extra money'}
                    subtitle={[formatShortDate(i.receivedOn, today), i.kind === 'scheduled' ? i.note : null].filter(Boolean).join(' · ')}
                    trailing={<span className="tabular text-body font-semibold text-ok">{formatMoney(i.amount, currency, { signed: true })}</span>}
                  />
                ))}
              </List>
            )}
          </Section>
      } />
    </Page>
  )
}
