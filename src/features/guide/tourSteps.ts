import {
  BookOpen,
  CalendarDays,
  CircleCheck,
  DatabaseBackup,
  FolderOpen,
  House,
  Library,
  PiggyBank,
  Plus,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import type { Tone } from '@/components/ui/display'
import type { TourStep } from '@/domain/guides'

export const TOUR_ID = 'tour'

/**
 * Bump when steps are added. Students who already took the tour are offered only the steps whose
 * `since` is newer than the version they finished, never the whole tour again.
 */
export const TOUR_VERSION = 1

/**
 * The app tour: about a minute, one idea per screen. Targets are `data-tour` attributes on real
 * controls; when none is on screen (an empty state, a different layout) the card still shows.
 */
export const TOUR_STEPS: TourStep[] = [
  {
    id: 'home',
    route: '/',
    targets: ['nav-home'],
    title: 'Your day at a glance',
    body: "Home shows your next class, what's due today and how much you can safely spend. Tap Home to come back anytime.",
    since: 1,
  },
  {
    id: 'tasks',
    route: '/tasks',
    targets: ['tasks-add', 'nav-tasks'],
    title: 'Tasks',
    body: "Keep assignments and study tasks in one list. Tap + to add your first task, and tick its circle when it's done.",
    since: 1,
  },
  {
    id: 'schedule',
    route: '/schedule',
    targets: ['schedule-days', 'schedule-add', 'nav-schedule'],
    title: 'Schedule',
    body: 'See your classes, free time, deadlines and exams for each day. Tap + to add your class times.',
    since: 1,
  },
  {
    id: 'budget',
    route: '/budget',
    targets: ['budget-overview', 'nav-budget'],
    title: 'Budget',
    body: 'Track your allowance and what you spend. "Safe to spend" is how much you can use today and still make it to your next allowance.',
    since: 1,
  },
  {
    id: 'subjects',
    route: '/subjects',
    targets: ['subjects-add'],
    title: 'Subjects',
    body: 'Each subject keeps its classes, notes, grades, attendance and files together. You can find Subjects under More.',
    since: 1,
  },
  {
    id: 'files',
    route: '/files',
    targets: ['files-add'],
    title: 'Files',
    body: 'Import PDFs or photograph your notes. Everything is stored on this phone, so it opens without internet.',
    since: 1,
  },
  {
    id: 'quickAdd',
    route: '/',
    targets: ['quick-add'],
    title: 'Quick add',
    body: 'Tap + on Home to add a task, expense, class, exam, note or file in a few seconds.',
    since: 1,
  },
]

export interface FeatureGuide {
  id: string
  title: string
  icon: LucideIcon
  tone: Tone
  /** Two or three short how-tos. */
  points: string[]
  /** Tour step that shows this feature on its real screen, if there is one. */
  tourStep?: string
  /** Otherwise, the screen to open, and its button label when "Open <title>" would be wrong. */
  to?: string
  toLabel?: string
}

/** Settings → Help & guide → Feature guides. */
export const FEATURE_GUIDES: FeatureGuide[] = [
  {
    id: 'home',
    title: 'Home',
    icon: House,
    tone: 'mint',
    points: [
      'Shows your next class, what is due today and your money for today.',
      'After a class ends, one tap records whether you were present, late or absent.',
    ],
    tourStep: 'home',
  },
  {
    id: 'tasks',
    title: 'Tasks',
    icon: CircleCheck,
    tone: 'lime',
    points: [
      'Tap + to add a task with a due date, subject and priority.',
      'Tap the circle to complete it; tap the title to edit it.',
      'Switch between Today, Upcoming, Overdue and Done at the top.',
    ],
    tourStep: 'tasks',
  },
  {
    id: 'schedule',
    title: 'Schedule',
    icon: CalendarDays,
    tone: 'sky',
    points: [
      'Add each class once with its days and times; it repeats every week.',
      'Pick a day to see its classes, free time, deadlines and exams.',
    ],
    tourStep: 'schedule',
  },
  {
    id: 'budget',
    title: 'Budget & allowance',
    icon: Wallet,
    tone: 'pink',
    points: [
      'Set up your allowance once: how much you get and how often.',
      'Record each expense with Add expense; your totals update instantly.',
      'Tap "Safe today" to see how the daily amount is worked out.',
    ],
    tourStep: 'budget',
  },
  {
    id: 'subjects',
    title: 'Subjects',
    icon: Library,
    tone: 'lilac',
    points: [
      "Add the subjects you're taking this term, each with its own colour.",
      'Open a subject to see its classes, tasks, notes, grades, attendance and files.',
    ],
    tourStep: 'subjects',
  },
  {
    id: 'exams',
    title: 'Exams & quizzes',
    icon: BookOpen,
    tone: 'peach',
    points: ['Add an exam with its date and the topics it covers.', 'Tick topics off as you study to track how ready you are.'],
    to: '/exams',
  },
  {
    id: 'files',
    title: 'Files',
    icon: FolderOpen,
    tone: 'sun',
    points: [
      'Import PDFs and documents, or scan pages with the camera.',
      'Attach files to tasks, exams and notes without making copies.',
    ],
    tourStep: 'files',
  },
  {
    id: 'savings',
    title: 'Savings goals',
    icon: PiggyBank,
    tone: 'mint',
    points: ['Create a goal with a target amount and an optional date.', 'Add or withdraw money; your balance is always worked out for you.'],
    to: '/savings',
  },
  {
    id: 'quickAdd',
    title: 'Quick add',
    icon: Plus,
    tone: 'lilac',
    points: ['The + button on Home adds a task, expense, class, exam, note or file from one place.'],
    tourStep: 'quickAdd',
  },
  {
    id: 'backup',
    title: 'Backup & restore',
    icon: DatabaseBackup,
    tone: 'sky',
    points: [
      'Everything stays on this phone. Nothing is uploaded.',
      'Make a backup in Settings before changing phones, then restore it on the new one.',
    ],
    to: '/settings',
    toLabel: 'Open Settings',
  },
]
