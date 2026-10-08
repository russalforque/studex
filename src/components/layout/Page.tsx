import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { IconButton } from '@/components/ui/Button'
import { cn } from '@/utils/cn'

interface PageProps {
  /** Large title for tab roots; detail pages pass `back` and get a compact title beside the back button. */
  title?: string
  subtitle?: ReactNode
  back?: string | true
  actions?: ReactNode
  /** Replaces the title row entirely (Home uses it for the greeting). */
  header?: ReactNode
  children: ReactNode
  /** Space for a floating button above the nav. */
  fab?: boolean
  /** Tablet landscape: allow a two-column layout instead of a reading-width column. */
  wide?: boolean
}

/** True once the page has scrolled, so the sticky header can show where content passes under it. */
function useScrolled(): boolean {
  const [scrolled, setScrolled] = useState(() => window.scrollY > 4)
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 4)
    update()
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [])
  return scrolled
}

export function Page({ title, subtitle, back, actions, header, children, fab, wide }: PageProps) {
  const navigate = useNavigate()
  const scrolled = useScrolled()
  const goBack = () => {
    if (back === true) {
      if (window.history.length > 1) navigate(-1)
      else navigate('/', { replace: true })
    } else if (back) navigate(back)
  }

  return (
    <div className={cn(
        'mx-auto min-h-dvh w-full rail:px-4',
        // `wide` is only set from 1024px up, so it replaces the reading width instead of competing with it.
        wide ? 'max-w-6xl lg:px-8' : 'max-w-lg rail:max-w-2xl',
      )}>
      <header
        className={cn(
          'pt-safe sticky top-0 z-30 border-b bg-bg/90 backdrop-blur-md transition-colors duration-200',
          scrolled ? 'border-line' : 'border-transparent',
        )}
      >
        <div className="px-safe flex min-h-18 items-center gap-3 py-2">
          {header ?? (
            <>
              {back && (
                <IconButton label="Back" onClick={goBack}>
                  <ArrowLeft className="size-5" strokeWidth={2} />
                </IconButton>
              )}
              <div className="min-w-0 flex-1">
                {title && (
                  <h1 className={cn('truncate font-bold', back ? 'text-title-3' : 'text-large-title leading-tight')}>{title}</h1>
                )}
              </div>
            </>
          )}
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      </header>
      <main
        className="px-safe pt-1"
        style={{ paddingBottom: `calc(var(--nav-h) + var(--sab) + ${fab ? 96 : 32}px)` }}
      >
        {subtitle && <div className="-mt-1 mb-5 text-body text-ink-2">{subtitle}</div>}
        {children}
      </main>
    </div>
  )
}
