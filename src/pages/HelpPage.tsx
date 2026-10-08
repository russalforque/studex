import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ArrowUpRight, ChevronDown, Compass, Lightbulb, Play } from 'lucide-react'
import { useRepos } from '@/app/contexts'
import { Page } from '@/components/layout/Page'
import { Button } from '@/components/ui/Button'
import { HeroCard } from '@/components/ui/HeroCard'
import { IconCircle, List, Row, Section } from '@/components/ui/display'
import { useTour } from '@/features/guide/TourContext'
import { FEATURE_GUIDES, TOUR_STEPS, type FeatureGuide } from '@/features/guide/tourSteps'
import { useAction } from '@/hooks/useAction'
import { cn } from '@/utils/cn'

const BASICS = [
  { title: 'Add your subjects and class times', body: 'Your schedule and Home fill in from them.' },
  { title: 'Add tasks and exams as they come', body: 'Due dates show on Home, Tasks and Schedule.' },
  { title: 'Set your allowance, then log spending', body: 'Studex works out what is safe to spend each day.' },
]

/** Settings → Help & guide: replay the tour, the basics in three steps, and a short guide per feature. */
export function HelpPage() {
  const repos = useRepos()
  const tour = useTour()
  const [params] = useSearchParams()
  const guidesRef = useRef<HTMLElement>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const resetTips = useAction(() => repos.guides.resetTips(), ['guides'], { success: 'Feature tips will show again' })

  // Settings → Feature guides lands on that section.
  const section = params.get('section')
  useEffect(() => {
    if (section === 'guides') guidesRef.current?.scrollIntoView({ block: 'start' })
  }, [section])

  return (
    <Page title="Help & guide" back>
      <HeroCard
        tone="lilac"
        art={Compass}
        footer={
          <Button icon={<Play className="size-4" aria-hidden />} onClick={() => tour.start()}>
            Take the app tour
          </Button>
        }
      >
        <p className="text-title-2 leading-tight font-bold">New here?</p>
        <p className="mt-1.5 text-subhead text-ink-2">
          A {TOUR_STEPS.length}-stop walk through the main screens, about a minute. Nothing is added or changed.
        </p>
      </HeroCard>

      <Section title="How to use Studex">
        <ol className="card flex flex-col rounded-[28px] px-4 py-1">
          {BASICS.map((b, i) => (
            <li key={b.title} className="flex gap-3.5 border-b border-line py-3.5 last:border-b-0">
              <span className="tabular flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-subhead font-bold text-accent-ink">
                {i + 1}
              </span>
              <span className="min-w-0 pt-0.5">
                <span className="block text-body leading-snug font-semibold">{b.title}</span>
                <span className="mt-0.5 block text-subhead text-ink-2">{b.body}</span>
              </span>
            </li>
          ))}
        </ol>
      </Section>

      <span ref={guidesRef} className="block scroll-mt-24" aria-hidden />
      <Section title="Feature guides">
        <List>
          {FEATURE_GUIDES.map((g) => (
            <GuideCard
              key={g.id}
              guide={g}
              open={openId === g.id}
              onToggle={() => setOpenId((id) => (id === g.id ? null : g.id))}
              onShow={(step) => tour.start([step])}
            />
          ))}
        </List>
      </Section>

      <Section title="Tips">
        <List>
          <Row
            onClick={() => resetTips.fire()}
            leading={<IconCircle icon={Lightbulb} tone="sun" />}
            title="Show feature tips again"
            subtitle="Short hints the first time you add an expense, subject, goal or file"
          />
        </List>
      </Section>
    </Page>
  )
}

function GuideCard({
  guide: g,
  open,
  onToggle,
  onShow,
}: {
  guide: FeatureGuide
  open: boolean
  onToggle: () => void
  onShow: (step: string) => void
}) {
  const panelId = `guide-${g.id}`
  return (
    <div className={cn('card rounded-[26px] transition-colors', open && 'border-ink/15')}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className="press flex min-h-16 w-full items-center gap-3 rounded-[26px] py-2.5 pr-4 pl-2.5 text-left"
      >
        <IconCircle icon={g.icon} tone={g.tone} />
        <span className="min-w-0 flex-1 truncate text-body font-semibold">{g.title}</span>
        <ChevronDown className={cn('size-4.5 shrink-0 text-ink-3 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div id={panelId} className="animate-fade-in px-4 pb-4">
          <ul className="flex flex-col gap-2 pl-1">
            {g.points.map((p) => (
              <li key={p} className="flex gap-2.5 text-subhead leading-snug text-ink-2">
                <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-ink-3" aria-hidden />
                {p}
              </li>
            ))}
          </ul>
          {g.tourStep ? (
            <Button variant="secondary" className="mt-4" icon={<Play className="size-4" aria-hidden />} onClick={() => onShow(g.tourStep!)}>
              Show me
            </Button>
          ) : (
            g.to && (
              <Link
                to={g.to}
                className="press mt-4 inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface px-5 text-body font-semibold active:bg-surface-2"
              >
                {g.toLabel ?? `Open ${g.title}`}
                <ArrowUpRight className="size-4" aria-hidden />
              </Link>
            )
          )}
        </div>
      )}
    </div>
  )
}
