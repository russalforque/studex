import { Link } from 'react-router'
import { ArrowUpRight, BookOpen, Library, PiggyBank, Settings, Sparkles, type LucideIcon } from 'lucide-react'
import { Page } from '@/components/layout/Page'
import { IconCircle, type Tone } from '@/components/ui/display'

const ITEMS: Array<{ to: string; label: string; hint: string; icon: LucideIcon; tone: Tone }> = [
  { to: '/subjects', label: 'Subjects', hint: 'Instructors, rooms and class times', icon: Library, tone: 'sky' },
  { to: '/exams', label: 'Exams & quizzes', hint: 'What to study for next', icon: BookOpen, tone: 'pink' },
  { to: '/savings', label: 'Savings goals', hint: 'Track what you are saving for', icon: PiggyBank, tone: 'mint' },
  { to: '/settings', label: 'Settings', hint: 'Profile, term, currency and budget', icon: Settings, tone: 'lilac' },
]

export function MorePage() {
  return (
    <Page title="More">
      <ul className="grid grid-cols-2 gap-2.5">
        {ITEMS.map(({ to, label, hint, icon, tone }) => (
          <li key={to}>
            <Link to={to} className="card press flex h-full flex-col gap-4 rounded-[28px] p-4 active:bg-surface-2">
              <span className="flex items-start justify-between">
                <IconCircle icon={icon} tone={tone} />
                <span className="flex size-8 items-center justify-center rounded-full bg-surface-2 text-ink-2" aria-hidden>
                  <ArrowUpRight className="size-4" />
                </span>
              </span>
              <span>
                <span className="block text-[16px] font-semibold">{label}</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-ink-2">{hint}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex items-center gap-3 rounded-[28px] border border-dashed border-surface-3 px-4 py-4">
        <IconCircle icon={Sparkles} tone="sun" />
        <p className="text-[13.5px] text-ink-2">Grades, attendance and notes are coming in the next update.</p>
      </div>
    </Page>
  )
}
