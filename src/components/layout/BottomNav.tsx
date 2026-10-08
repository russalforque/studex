import type { MouseEvent } from 'react'
import { Link } from 'react-router'
import { CalendarDays, CircleCheck, House, LayoutGrid, Wallet, type LucideIcon } from 'lucide-react'
import { cn } from '@/utils/cn'

const TABS: Array<{ to: string; label: string; icon: LucideIcon }> = [
  { to: '/', label: 'Home', icon: House },
  { to: '/tasks', label: 'Tasks', icon: CircleCheck },
  { to: '/schedule', label: 'Schedule', icon: CalendarDays },
  { to: '/budget', label: 'Budget', icon: Wallet },
  { to: '/more', label: 'More', icon: LayoutGrid },
]

/** The tab owning a route: matched by its first segment; every other page (subjects, notes, settings…) lives under More. */
function activeTab(pathname: string): string {
  const root = `/${pathname.split('/')[1] ?? ''}`
  return TABS.some((t) => t.to === root) ? root : '/more'
}

/** Tapping the tab you're already on scrolls back to the top, like native tab bars. */
function scrollTopIfActive(active: boolean) {
  return (e: MouseEvent) => {
    if (!active) return
    e.preventDefault()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
}

/**
 * Phones: a floating labelled bar; the active tab's icon sits in a dark capsule.
 * Tablets: the same five destinations as a rail on the left edge.
 */
export function BottomNav({ pathname }: { pathname: string }) {
  const current = activeTab(pathname)
  return (
    <>
      <nav
        aria-label="Main"
        className="bottom-nav pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center rail:hidden"
        style={{
          paddingBottom: 'calc(var(--sab) + 12px)',
          paddingLeft: 'max(12px, var(--sal))',
          paddingRight: 'max(12px, var(--sar))',
        }}
      >
        {/* Every tab keeps its label: words are recognised faster than icons are recalled. */}
        <ul className="pointer-events-auto flex h-17 w-full max-w-md items-center rounded-[28px] border border-line bg-surface/95 px-1.5 shadow-float backdrop-blur-md">
          {TABS.map(({ to, label, icon: Icon }) => {
            const active = to === current
            return (
              <li key={to} className="min-w-0 flex-1">
                <Link
                  to={to}
                  aria-current={active ? 'page' : undefined}
                  data-tour={`nav-${label.toLowerCase()}`}
                  onClick={scrollTopIfActive(active)}
                  className="group flex h-14 flex-col items-center justify-center gap-1 rounded-[22px] active:bg-surface-2"
                >
                  <span
                    className={cn(
                      'flex h-7 w-12 items-center justify-center rounded-full',
                      'transition-[background-color,color,transform] duration-200 group-active:scale-95 motion-reduce:transition-none',
                      active ? 'bg-accent text-accent-ink' : 'text-ink-2',
                    )}
                  >
                    <Icon className="size-5 shrink-0" strokeWidth={active ? 2.2 : 1.9} aria-hidden />
                  </span>
                  <span className={cn('max-w-full truncate text-caption-2 leading-tight', active ? 'font-semibold text-ink' : 'font-medium text-ink-2')}>
                    {label}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <nav
        aria-label="Main"
        className="fixed inset-y-0 left-0 z-40 hidden flex-col items-center border-r border-line bg-surface rail:flex"
        style={{ width: 'var(--rail-w)', paddingLeft: 'var(--sal)', paddingTop: 'calc(var(--sat) + 12px)', paddingBottom: 'calc(var(--sab) + 12px)' }}
      >
        <ul className="flex flex-col gap-3 overflow-y-auto short:gap-0.5">
          {TABS.map(({ to, label, icon: Icon }) => {
            const active = to === current
            return (
              <li key={to}>
                <Link
                  to={to}
                  aria-current={active ? 'page' : undefined}
                  data-tour={`nav-${label.toLowerCase()}`}
                  onClick={scrollTopIfActive(active)}
                  className="group press flex w-18 flex-col items-center gap-1 py-1 short:w-14"
                >
                  <span
                    className={cn(
                      'flex h-9 w-14 items-center justify-center rounded-full transition-colors',
                      active ? 'bg-accent text-accent-ink' : 'text-ink-2 group-hover:bg-surface-2 group-active:bg-surface-2',
                    )}
                  >
                    <Icon className="size-5" strokeWidth={active ? 2.2 : 1.9} aria-hidden />
                  </span>
                  <span className={cn('text-caption short:sr-only', active ? 'font-semibold text-ink' : 'font-medium text-ink-2')}>{label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </>
  )
}
