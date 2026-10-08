import { NavLink } from 'react-router'
import { CalendarDays, CircleCheck, House, LayoutGrid, Wallet, type LucideIcon } from 'lucide-react'
import { cn } from '@/utils/cn'

const TABS: Array<{ to: string; label: string; icon: LucideIcon; end?: boolean }> = [
  { to: '/', label: 'Home', icon: House, end: true },
  { to: '/tasks', label: 'Tasks', icon: CircleCheck },
  { to: '/schedule', label: 'Schedule', icon: CalendarDays },
  { to: '/budget', label: 'Budget', icon: Wallet },
  { to: '/more', label: 'More', icon: LayoutGrid },
]

/** More-section routes highlight the More tab. */
const MORE_PREFIXES = ['/more', '/subjects', '/exams', '/savings', '/settings']

/** Floating pill: the active tab expands into a dark capsule with its label. */
export function BottomNav({ pathname }: { pathname: string }) {
  const inMore = MORE_PREFIXES.some((p) => pathname.startsWith(p))
  return (
    <nav
      aria-label="Main"
      className="bottom-nav pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center"
      style={{
        paddingBottom: 'calc(var(--sab) + 12px)',
        paddingLeft: 'max(12px, var(--sal))',
        paddingRight: 'max(12px, var(--sar))',
      }}
    >
      <ul className="pointer-events-auto flex h-14 border border-line bg-surface items-center gap-1 rounded-full p-1.5 shadow-float">
        {TABS.map(({ to, label, icon: Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              aria-label={label}
              className={({ isActive }) => {
                const active = to === '/more' ? inMore : isActive && !(to === '/' && inMore)
                return cn(
                  'press flex h-11 items-center justify-center gap-1.5 rounded-full text-[13px] font-semibold transition-[background-color,padding] duration-200',
                  active ? 'bg-accent pr-4 pl-3.5 text-accent-ink' : 'w-11 border border-line text-ink active:bg-surface-2',
                )
              }}
            >
              {({ isActive }) => {
                const active = to === '/more' ? inMore : isActive && !(to === '/' && inMore)
                return (
                  <>
                    <Icon className="size-5 shrink-0" strokeWidth={1.9} aria-hidden />
                    {active && <span>{label}</span>}
                  </>
                )
              }}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
