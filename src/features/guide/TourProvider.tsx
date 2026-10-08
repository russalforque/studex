import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Compass, Sparkles } from 'lucide-react'
import { useRepos } from '@/app/contexts'
import { Button } from '@/components/ui/Button'
import { IconCircle } from '@/components/ui/display'
import { Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { clampStep, tourOffer, type TourStep } from '@/domain/guides'
import { useGuides } from '@/hooks/data'
import { pushBackHandler } from '@/services/backStack'
import type { GuideStatus } from '@/types/models'
import { TourContext, type TourControls } from './TourContext'
import { TourOverlay } from './TourOverlay'
import { TOUR_ID, TOUR_STEPS, TOUR_VERSION } from './tourSteps'

type Mode = 'tour' | 'whatsNew' | 'feature'

interface Run {
  steps: TourStep[]
  index: number
  mode: Mode
  /** Where the student was when it started; they're returned there afterwards. */
  origin: string
}

const LATER_HINT = 'You can take the tour anytime in Settings → Help & guide.'

/**
 * Owns the app tour: offers it once after setup (or just its new steps after an update), walks
 * through real screens, and records how it ended. Progress writes never block the tour: if one
 * fails the tour still works, it may just be offered again.
 */
export function TourProvider({ children }: { children: ReactNode }) {
  const repos = useRepos()
  const client = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { data: guides } = useGuides()
  const [run, setRun] = useState<Run | null>(null)
  // The offer is answered at most once per app session, whatever the outcome.
  const [answered, setAnswered] = useState(false)

  const progress = guides?.find((g) => g.id === TOUR_ID)
  const offer = guides && !answered && !run ? tourOffer(progress, TOUR_STEPS, TOUR_VERSION) : null

  const save = useCallback(
    (status: GuideStatus, step: number) => {
      repos.guides
        .save(TOUR_ID, TOUR_VERSION, status, step)
        .then(() => client.invalidateQueries({ queryKey: ['guides'] }))
        .catch((err) => console.error('Saving tour progress failed', err))
    },
    [repos, client],
  )

  const begin = useCallback(
    (steps: TourStep[], mode: Mode) => {
      if (steps.length === 0) return
      setAnswered(true)
      setRun({ steps, index: 0, mode, origin: pathname })
      if (mode !== 'feature') save('started', 0)
    },
    [pathname, save],
  )

  const end = useCallback(
    (completed: boolean) => {
      if (!run) return
      if (run.mode !== 'feature') save(completed ? 'completed' : 'skipped', completed ? run.steps.length : run.index + 1)
      setRun(null)
      // replace: tour hops never pile up in the back history.
      if (run.origin !== pathname) navigate(run.origin, { replace: true })
      if (completed && run.mode === 'tour') toast("You're all set. Replay the tour anytime in Settings.")
    },
    [run, pathname, save, navigate, toast],
  )

  const step = run ? run.steps[clampStep(run.index, run.steps.length)] : undefined

  // Open each step's screen. Taps on the page are blocked meanwhile, so this is the only navigation.
  useEffect(() => {
    if (step && pathname !== step.route) navigate(step.route, { replace: true })
  }, [step, pathname, navigate])

  // While touring: Android back / Escape skips, and the page is hidden from taps, focus and screen readers.
  const endRef = useRef(end)
  useEffect(() => {
    endRef.current = end
  })
  const running = !!run
  useEffect(() => {
    if (!running) return
    const release = pushBackHandler(() => endRef.current(false))
    const root = document.getElementById('root')
    root?.setAttribute('inert', '')
    root?.setAttribute('aria-hidden', 'true')
    return () => {
      release()
      root?.removeAttribute('inert')
      root?.removeAttribute('aria-hidden')
    }
  }, [running])

  const controls = useMemo<TourControls>(
    () => ({
      start: (stepIds) => begin(stepIds ? TOUR_STEPS.filter((s) => stepIds.includes(s.id)) : TOUR_STEPS, stepIds ? 'feature' : 'tour'),
      active: running,
    }),
    [begin, running],
  )

  const declineWelcome = () => {
    setAnswered(true)
    save('skipped', 0)
    toast(LATER_HINT)
  }
  const declineWhatsNew = () => {
    setAnswered(true)
    // Recorded at the new version so it isn't offered again; the earlier progress is kept.
    save(progress?.status === 'completed' ? 'completed' : 'skipped', Math.max(1, progress?.step ?? 1))
  }

  return (
    <TourContext.Provider value={controls}>
      {children}

      <Sheet
        open={offer?.kind === 'welcome'}
        onClose={declineWelcome}
        title="Welcome!"
        footer={
          <div className="flex flex-col gap-1.5">
            <Button size="lg" block icon={<Compass className="size-5" aria-hidden />} onClick={() => begin(TOUR_STEPS, 'tour')}>
              Start tour
            </Button>
            <Button variant="ghost" block onClick={declineWelcome}>
              Maybe later
            </Button>
          </div>
        }
      >
        <div className="flex items-start gap-4 pb-2">
          <IconCircle icon={Compass} tone="lilac" large />
          <div>
            <p className="text-headline leading-snug font-semibold">Let's take a quick tour of your student companion.</p>
            <p className="mt-1.5 text-subhead text-ink-2">
              {TOUR_STEPS.length} stops, about a minute. Nothing is added or changed, and you can skip anytime.
            </p>
          </div>
        </div>
      </Sheet>

      <Sheet
        open={offer?.kind === 'whatsNew'}
        onClose={declineWhatsNew}
        title="New in Studex"
        footer={
          <div className="flex flex-col gap-1.5">
            <Button size="lg" block onClick={() => offer?.kind === 'whatsNew' && begin(offer.steps, 'whatsNew')}>
              Show me
            </Button>
            <Button variant="ghost" block onClick={declineWhatsNew}>
              Not now
            </Button>
          </div>
        }
      >
        <div className="flex items-start gap-4 pb-2">
          <IconCircle icon={Sparkles} tone="mint" large />
          <div className="min-w-0">
            <p className="text-headline leading-snug font-semibold">A few things were added since your last tour.</p>
            {offer?.kind === 'whatsNew' && (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {offer.steps.map((s) => (
                  <li key={s.id} className="rounded-full bg-surface-2 px-3 py-1 text-footnote font-semibold text-ink-2">
                    {s.title}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Sheet>

      {run && step && (
        <TourOverlay
          key={`${run.mode}-${step.id}`}
          step={step}
          index={run.index}
          count={run.steps.length}
          single={run.mode === 'feature' && run.steps.length === 1}
          onBack={() => setRun((r) => (r ? { ...r, index: clampStep(r.index - 1, r.steps.length) } : r))}
          onNext={() => (run.index >= run.steps.length - 1 ? end(true) : setRun({ ...run, index: run.index + 1 }))}
          onClose={() => end(false)}
        />
      )}
    </TourContext.Provider>
  )
}
