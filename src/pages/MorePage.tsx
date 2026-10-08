import { Link } from 'react-router'
import {
  ArrowUpRight,
  BookOpen,
  CalendarRange,
  FolderOpen,
  GraduationCap,
  Library,
  LifeBuoy,
  NotebookPen,
  PiggyBank,
  Search,
  Settings,
  Timer,
  type LucideIcon,
} from 'lucide-react'
import { Page } from '@/components/layout/Page'
import { IconCircle, type Tone } from '@/components/ui/display'

const ITEMS: Array<{ to: string; label: string; hint: string; icon: LucideIcon; tone: Tone }> = [
  { to: '/subjects', label: 'Subjects', hint: 'Instructors, rooms and class times', icon: Library, tone: 'sky' },
  { to: '/grades', label: 'Grades & attendance', hint: 'How each subject is going', icon: GraduationCap, tone: 'lime' },
  { to: '/exams', label: 'Exams & quizzes', hint: 'What to study for next', icon: BookOpen, tone: 'pink' },
  { to: '/focus', label: 'Focus', hint: 'Study timer and history', icon: Timer, tone: 'lilac' },
  { to: '/week', label: 'Your week', hint: 'Study, classes and money', icon: CalendarRange, tone: 'mint' },
  { to: '/notes', label: 'Notes', hint: 'Quick notes, by subject', icon: NotebookPen, tone: 'lilac' },
  { to: '/files', label: 'Files', hint: 'Photos, scans and PDFs', icon: FolderOpen, tone: 'sun' },
  { to: '/savings', label: 'Savings goals', hint: 'Track what you are saving for', icon: PiggyBank, tone: 'mint' },
  { to: '/settings', label: 'Settings', hint: 'Profile, terms, reminders, backup', icon: Settings, tone: 'peach' },
  { to: '/help', label: 'Help & guide', hint: 'App tour and how-tos', icon: LifeBuoy, tone: 'sky' },
]

export function MorePage() {
  return (
    <Page
      title="More"
      actions={
        <Link
          to="/search"
          aria-label="Search"
          className="press card inline-flex size-11 items-center justify-center rounded-full text-ink active:bg-surface-2"
        >
          <Search className="size-5" />
        </Link>
      }
    >
      <ul className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
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
                <span className="block text-callout font-semibold">{label}</span>
                <span className="mt-0.5 block text-footnote leading-snug text-ink-2">{hint}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Page>
  )
}
