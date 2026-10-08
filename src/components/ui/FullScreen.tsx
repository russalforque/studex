import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft } from 'lucide-react'
import { pushBackHandler } from '@/services/backStack'
import { cn } from '@/utils/cn'
import { IconButton } from './Button'

/**
 * A full-screen layer for the file viewer and the scanner. Like a sheet it closes on the
 * Android back button, keeps focus inside and hides the page behind from screen readers.
 */
export function FullScreen({
  title,
  subtitle,
  onClose,
  actions,
  children,
  dark,
  footer,
}: {
  title: string
  subtitle?: string
  onClose: () => void
  actions?: ReactNode
  children: ReactNode
  /** Black background, for photos and scans. */
  dark?: boolean
  footer?: ReactNode
}) {
  const titleId = useId()
  const ref = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    const release = pushBackHandler(() => onCloseRef.current())
    const previouslyFocused = document.activeElement as HTMLElement | null
    ref.current?.focus({ preventScroll: true })
    const root = document.getElementById('root')
    const wasInert = root?.hasAttribute('inert')
    root?.setAttribute('inert', '')
    root?.setAttribute('aria-hidden', 'true')
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => {
      release()
      if (!wasInert) {
        root?.removeAttribute('inert')
        root?.removeAttribute('aria-hidden')
      }
      document.body.style.overflow = overflow
      previouslyFocused?.focus?.({ preventScroll: true })
    }
  }, [])

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      className={cn('animate-fade-in fixed inset-0 z-50 flex flex-col outline-none', dark ? 'bg-black text-white' : 'bg-bg text-ink')}
    >
      <header className="pt-safe shrink-0" style={{ paddingLeft: 'var(--sal)', paddingRight: 'var(--sar)' }}>
        <div className="flex min-h-16 items-center gap-2 px-3 py-2">
          <IconButton label="Back" onClick={onClose} tone={dark ? 'onDark' : 'default'}>
            <ArrowLeft className="size-5" strokeWidth={2} />
          </IconButton>
          <div className="min-w-0 flex-1 px-1">
            <h2 id={titleId} className="truncate text-headline font-semibold">
              {title}
            </h2>
            {subtitle && <p className={cn('truncate text-footnote', dark ? 'text-white/60' : 'text-ink-2')}>{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      </header>
      <div className="relative min-h-0 flex-1">{children}</div>
      {footer && (
        <div
          className={cn('shrink-0 border-t px-4 pt-3', dark ? 'border-white/10' : 'border-line')}
          style={{ paddingBottom: 'max(12px, var(--sab))', paddingLeft: 'max(16px, var(--sal))', paddingRight: 'max(16px, var(--sar))' }}
        >
          {footer}
        </div>
      )}
    </div>,
    document.body,
  )
}
