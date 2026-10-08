import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { TourStep } from '@/domain/guides'
import { cn } from '@/utils/cn'
import { placeCard, type Box, type Insets } from './placement'

/** Breathing room between a control and the spotlight around it. */
const PAD = 6
/** How long to wait for a target to render (data loading, route change) before going without one. */
const FIND_TIMEOUT = 1800
/** Phones get a full-width card; matches the `rail` breakpoint in index.css. */
const COMPACT = '(max-width: 599px)'

interface Spot extends Box {
  radius: number
}

interface Frame {
  spot: Spot | null
  missing: boolean
  view: { width: number; height: number }
  insets: Insets
}

function isShown(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'
}

/** The step's targets that are on screen, in order of preference (hidden layouts, like the rail on phones, are skipped). */
function findTargets(names: string[]): HTMLElement[] {
  const found: HTMLElement[] = []
  for (const name of names) {
    for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)) {
      if (isShown(el)) found.push(el)
    }
  }
  return found
}

/** The spotlight around an element, clamped to the screen so an oversized target still gets an outline. */
function spotFor(el: HTMLElement, viewHeight: number): Spot {
  const r = el.getBoundingClientRect()
  const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 16
  const top = Math.max(r.top - PAD, 4)
  const bottom = Math.min(r.bottom + PAD, viewHeight - 4)
  return { top, left: r.left - PAD, width: r.width + PAD * 2, height: Math.max(0, bottom - top), radius: radius + PAD }
}

/** Fixed and sticky elements (nav, header buttons, the + button) are always in view; scrolling would only move the page. */
function isPinned(el: HTMLElement): boolean {
  for (let n: HTMLElement | null = el; n && n !== document.body; n = n.parentElement) {
    const { position } = getComputedStyle(n)
    if (position === 'fixed' || position === 'sticky') return true
  }
  return false
}

function bringIntoView(el: HTMLElement) {
  if (isPinned(el)) return
  const r = el.getBoundingClientRect()
  // Leave room for the sticky header above and the tour card below.
  if (r.top >= 96 && r.bottom <= window.innerHeight - 220) return
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
}

const sameFrame = (a: Frame, b: Frame) =>
  a.missing === b.missing &&
  a.view.width === b.view.width &&
  a.view.height === b.view.height &&
  a.insets.top === b.insets.top &&
  a.insets.bottom === b.insets.bottom &&
  a.insets.left === b.insets.left &&
  a.insets.right === b.insets.right &&
  (a.spot === b.spot ||
    (!!a.spot &&
      !!b.spot &&
      Math.abs(a.spot.top - b.spot.top) < 0.5 &&
      Math.abs(a.spot.left - b.spot.left) < 0.5 &&
      Math.abs(a.spot.width - b.spot.width) < 0.5 &&
      Math.abs(a.spot.height - b.spot.height) < 0.5))

/**
 * Follows the step's target every animation frame: it may render late (data loading), move
 * (scrolling, rotation, keyboard) or change size. Frames pause while the app is in the background
 * and pick up again on return. Only real changes cause a re-render.
 */
function useTargetFrame(
  step: TourStep,
  probe: RefObject<HTMLDivElement | null>,
  cardHeight: RefObject<number>,
): Frame | null {
  const [frame, setFrame] = useState<Frame | null>(null)
  useEffect(() => {
    let raf = 0
    let el: HTMLElement | null = null
    let started: number | null = null
    const opened = performance.now()
    const tick = () => {
      const p = probe.current ? getComputedStyle(probe.current) : null
      const insets: Insets = {
        top: parseFloat(p?.paddingTop ?? '0') || 0,
        right: parseFloat(p?.paddingRight ?? '0') || 0,
        bottom: parseFloat(p?.paddingBottom ?? '0') || 0,
        left: parseFloat(p?.paddingLeft ?? '0') || 0,
      }
      const view = { width: window.innerWidth, height: window.innerHeight }
      // Look only once the step's screen is showing; otherwise a fallback that exists everywhere
      // (a nav tab) would be picked before the real control renders.
      const path = window.location.hash.replace(/^#/, '').split('?')[0] || '/'
      if (path === step.route) {
        started ??= performance.now()
        // Re-checked every frame so a preferred target that renders late (after data loads) wins.
        // A target that leaves no room for the card beside it (a wide strip on a landscape phone)
        // gives way to the next one that does, so the card never covers what it points at.
        const candidates = findTargets(step.targets)
        const compact = window.matchMedia(COMPACT).matches
        const card = { height: cardHeight.current || 220 }
        const found =
          candidates.find((c) => placeCard(spotFor(c, view.height), card, view, insets, compact).side !== 'dock') ?? candidates[0] ?? null
        if (found !== el) {
          el = found
          if (el) bringIntoView(el)
        }
      }
      const spot = el ? spotFor(el, view.height) : null
      // Never leave the student without a card: give up on the target, not on the tour.
      const now = performance.now()
      const missing = !el && ((started !== null && now - started > FIND_TIMEOUT) || now - opened > FIND_TIMEOUT * 2)
      const next: Frame = { spot, missing, view, insets }
      setFrame((prev) => (prev && sameFrame(prev, next) ? prev : next))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [step, probe, cardHeight])
  return frame
}

interface TourOverlayProps {
  step: TourStep
  index: number
  count: number
  /** A single feature guide rather than the tour: no progress, "Got it" instead of Next. */
  single?: boolean
  onNext: () => void
  onBack: () => void
  onClose: () => void
}

/**
 * Dims the screen, cuts a spotlight around the real control and explains it in a small card
 * placed beside it. The page underneath can't be tapped, so nothing can be created or deleted by
 * accident; the card is the only thing that responds. Remount it per step (key by step id).
 */
export function TourOverlay({ step, index, count, single, onNext, onBack, onClose }: TourOverlayProps) {
  const titleId = useId()
  const bodyId = useId()
  const probe = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [cardHeight, setCardHeight] = useState(0)
  const cardHeightRef = useRef(0)
  const frame = useTargetFrame(step, probe, cardHeightRef)
  const last = index === count - 1

  useLayoutEffect(() => {
    const card = cardRef.current
    if (!card) return
    const ro = new ResizeObserver(() => {
      cardHeightRef.current = card.offsetHeight
      setCardHeight(card.offsetHeight)
    })
    ro.observe(card)
    return () => ro.disconnect()
  }, [])

  // Each step moves focus to its title, so screen readers announce it and Tab starts in the card.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
  }, [])

  const resolved = !!frame && (!!frame.spot || frame.missing)
  const compact = window.matchMedia(COMPACT).matches
  const place = frame && resolved ? placeCard(frame.spot, { height: cardHeight }, frame.view, frame.insets, compact) : null
  const ready = !!place && cardHeight > 0

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') onNext()
    else if (e.key === 'ArrowLeft' && index > 0) onBack()
  }

  return createPortal(
    <div className="tour">
      {/* Reads the safe-area insets as pixels; CSS variables can't be resolved from script directly. */}
      <div
        ref={probe}
        aria-hidden
        className="pointer-events-none invisible fixed"
        style={{ paddingTop: 'var(--sat)', paddingRight: 'var(--sar)', paddingBottom: 'var(--sab)', paddingLeft: 'var(--sal)' }}
      />
      {/* Catches every tap outside the card. Without a spotlight it carries the dimming itself. */}
      <div aria-hidden className={cn('animate-fade-in fixed inset-0 z-[55]', !frame?.spot && 'bg-scrim')} />
      {frame?.spot && (
        <div
          aria-hidden
          className="tour-spotlight pointer-events-none fixed z-[55]"
          style={{
            top: frame.spot.top,
            left: frame.spot.left,
            width: frame.spot.width,
            height: frame.spot.height,
            borderRadius: frame.spot.radius,
          }}
        />
      )}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        onKeyDown={onKeyDown}
        className={cn(
          'fixed z-[56] rounded-[26px] border border-line bg-surface p-5 shadow-float short:p-4',
          'transition-[top,left,opacity] duration-200 ease-out',
          ready ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        style={place ? { top: place.top, left: place.left, width: place.width } : { top: 0, left: 0, width: 'min(440px, calc(100vw - 24px))' }}
      >
        <div className="flex min-h-8 items-center justify-between gap-3">
          {single ? (
            <p className="label-caps">Feature guide</p>
          ) : (
            <p className="tabular text-footnote font-semibold text-ink-2">
              Step {index + 1} of {count}
            </p>
          )}
          <button
            type="button"
            onClick={onClose}
            className="press -my-1.5 -mr-2 min-h-11 rounded-full px-3 text-subhead font-semibold text-ink-2 active:bg-surface-2"
          >
            {single ? 'Close' : 'Skip tour'}
          </button>
        </div>
        {!single && (
          <div className="mt-2 flex gap-1" aria-hidden>
            {Array.from({ length: count }, (_, i) => (
              <span key={i} className={cn('h-1 flex-1 rounded-full transition-colors', i <= index ? 'bg-accent' : 'bg-surface-3')} />
            ))}
          </div>
        )}
        <h2 ref={headingRef} id={titleId} tabIndex={-1} className="mt-3.5 text-title-3 leading-tight font-bold outline-none short:mt-2.5 short:text-headline">
          {step.title}
        </h2>
        <p id={bodyId} className="mt-1.5 text-body leading-snug text-ink-2">
          {step.body}
        </p>
        <div className="mt-5 flex gap-2 short:mt-3">
          {!single && index > 0 && (
            <Button variant="secondary" onClick={onBack} icon={<ArrowLeft className="size-4" aria-hidden />}>
              Back
            </Button>
          )}
          <Button
            className="flex-1"
            onClick={onNext}
            icon={last ? <Check className="size-4" aria-hidden /> : undefined}
          >
            {single ? 'Got it' : last ? 'Finish' : 'Next'}
            {!last && !single && <ArrowRight className="-mr-1 size-4" aria-hidden />}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
