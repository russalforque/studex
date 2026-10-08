import type { ReactNode } from 'react'
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
}

export function Page({ title, subtitle, back, actions, header, children, fab }: PageProps) {
  const navigate = useNavigate()
  const goBack = () => {
    if (back === true) {
      if (window.history.length > 1) navigate(-1)
      else navigate('/', { replace: true })
    } else if (back) navigate(back)
  }

  return (
    <div className="mx-auto min-h-dvh w-full max-w-lg">
      <header className="pt-safe sticky top-0 z-30 bg-bg/90 backdrop-blur-md">
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
                  <h1 className={cn('truncate font-bold tracking-tight', back ? 'text-[20px]' : 'text-[28px] leading-tight')}>{title}</h1>
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
        {subtitle && <div className="-mt-1 mb-5 text-[15px] text-ink-2">{subtitle}</div>}
        {children}
      </main>
    </div>
  )
}
