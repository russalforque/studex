import { ArrowUpRight, PiggyBank, Plus, Target } from 'lucide-react'
import { Link } from 'react-router'
import { useClock, useSettings } from '@/app/contexts'
import { Page } from '@/components/layout/Page'
import { IconButton } from '@/components/ui/Button'
import { HeroCard, HeroPill } from '@/components/ui/HeroCard'
import { EmptyState, ErrorNotice, IconCircle, Loading, MetaChip, ProgressBar, Section, type Tone } from '@/components/ui/display'
import { progressPercent } from '@/domain/savings'
import { useSheets } from '@/features/sheets/SheetsContext'
import { useGoals } from '@/hooks/data'
import { formatDate } from '@/utils/dates'
import { formatMoney } from '@/utils/money'

const GOAL_TONES: Tone[] = ['mint', 'sky', 'peach', 'lilac', 'pink', 'sun', 'lime']

export function SavingsPage() {
  const open = useSheets()
  const { currency } = useSettings()
  const { today } = useClock()
  const { data: goals, isPending, error, refetch } = useGoals()
  const total = (goals ?? []).reduce((n, g) => n + g.balance, 0)
  const reachedCount = (goals ?? []).filter((g) => g.balance >= g.target).length

  return (
    <Page
      title="Savings goals"
      back={true}
      actions={
        <IconButton label="New goal" tone="accent" onClick={() => open({ type: 'goal' })}>
          <Plus className="size-5" />
        </IconButton>
      }
    >
      {isPending ? (
        <Loading />
      ) : error ? (
        <ErrorNotice message="Savings couldn't be loaded." onRetry={() => void refetch()} />
      ) : goals.length === 0 ? (
        <EmptyState
          icon={PiggyBank}
          tone="mint"
          title="No savings goals yet"
          message="Saving for a laptop, a trip or emergencies? Create a goal and watch it grow."
          action={{ label: 'Create goal', onClick: () => open({ type: 'goal' }) }}
        />
      ) : (
        <>
          <HeroCard tone="lime" art={PiggyBank}>
            <HeroPill icon={Target}>
              {goals.length} goal{goals.length === 1 ? '' : 's'}
              {reachedCount > 0 && ` · ${reachedCount} reached`}
            </HeroPill>
            <p className="tabular mt-4 text-[36px] leading-none font-bold tracking-tight">{formatMoney(total, currency)}</p>
            <p className="mt-1.5 text-[14px] text-ink-2">saved in total</p>
          </HeroCard>
          <Section title="Your goals">
            <ul className="flex flex-col gap-2.5">
              {goals.map((g, i) => {
                const pct = progressPercent(g.balance, g.target)
                return (
                  <li key={g.id}>
                    <Link to={`/savings/${g.id}`} className="card press block rounded-[28px] p-4 active:bg-surface-2">
                      <div className="flex items-center gap-3">
                        <IconCircle icon={PiggyBank} tone={GOAL_TONES[i % GOAL_TONES.length]!} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[15.5px] font-semibold">{g.name}</p>
                          <p className="tabular mt-0.5 truncate text-[13px] text-ink-2">
                            {formatMoney(g.balance, currency)} of {formatMoney(g.target, currency)}
                          </p>
                        </div>
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2" aria-hidden>
                          <ArrowUpRight className="size-4" />
                        </span>
                      </div>
                      <div className="mt-3.5 flex items-center gap-3">
                        <div className="flex-1">
                          <ProgressBar value={pct} tone={pct >= 100 ? 'ok' : 'accent'} label={`${g.name}: ${pct}% saved`} />
                        </div>
                        <span className="tabular w-10 shrink-0 text-right text-[13px] font-semibold">{pct}%</span>
                      </div>
                      {g.targetDate && (
                        <div className="mt-3">
                          <MetaChip>
                            By{' '}
                            {formatDate(g.targetDate, g.targetDate.slice(0, 4) === today.slice(0, 4) ? { month: 'long' } : { month: 'long', year: 'numeric' })}
                          </MetaChip>
                        </div>
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </Section>
        </>
      )}
    </Page>
  )
}
