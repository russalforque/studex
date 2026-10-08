import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { pushBackHandler } from '@/services/backStack'
import { IconButton } from './Button'

/** Sheets can stack (a confirmation over a form); the page is restored when the last one closes. */
let openSheets = 0

interface SheetProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** Sticky action area, e.g. the Save button. */
  footer?: ReactNode
  /** Extra header action shown left of the close button. */
  headerAction?: ReactNode
}

/**
 * Bottom sheet. Grows with its content up to most of the screen, scrolls inside,
 * and keeps its footer above the home indicator and the keyboard.
 */
export function Sheet({ open, onClose, title, children, footer, headerAction }: SheetProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!open) return
    const release = pushBackHandler(() => onCloseRef.current())
    const previouslyFocused = document.activeElement as HTMLElement | null
    panelRef.current?.focus({ preventScroll: true })
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    // The page behind is unreachable for taps, focus and screen readers while a sheet is up.
    const root = document.getElementById('root')
    openSheets += 1
    root?.setAttribute('inert', '')
    root?.setAttribute('aria-hidden', 'true')
    return () => {
      release()
      openSheets -= 1
      if (openSheets === 0) {
        root?.removeAttribute('inert')
        root?.removeAttribute('aria-hidden')
        document.body.style.overflow = overflow
      }
      previouslyFocused?.focus?.({ preventScroll: true })
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center rail:items-center rail:p-6" role="presentation">
      <div className="animate-fade-in absolute inset-0 bg-scrim" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="animate-sheet-in relative flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-[32px] bg-surface outline-none rail:max-h-[86dvh] rail:rounded-[32px] rail:shadow-float"
      >
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-surface-3 rail:invisible" aria-hidden />
        <header className="flex items-center gap-2 pt-2 pr-4 pb-2 pl-5">
          <h2 id={titleId} className="flex-1 truncate text-title-3 font-bold">
            {title}
          </h2>
          {headerAction}
          <IconButton label="Close" onClick={onClose}>
            <X className="size-5" />
          </IconButton>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-1 pb-4">{children}</div>
        {footer && (
          <div
            className="border-t border-line px-5 pt-3.5"
            style={{ paddingBottom: 'max(12px, var(--sab))' }}
          >
            {footer}
          </div>
        )}
        {!footer && <div style={{ height: 'var(--sab)' }} />}
      </div>
    </div>,
    document.body,
  )
}
