import { BookOpen, CalendarClock, ChevronRight, CircleCheck, Wallet, type LucideIcon } from 'lucide-react'
import { IconCircle, type Tone } from '@/components/ui/display'
import { Sheet } from '@/components/ui/Sheet'
import { useSheets, type SheetRequest } from './SheetsContext'

const ITEMS: Array<{ label: string; hint: string; icon: LucideIcon; tone: Tone; req: SheetRequest }> = [
  { label: 'Task', hint: 'Assignment, project or to-do', icon: CircleCheck, tone: 'mint', req: { type: 'task' } },
  { label: 'Expense', hint: 'Something you spent money on', icon: Wallet, tone: 'peach', req: { type: 'expense' } },
  { label: 'Class', hint: 'A class time on your schedule', icon: CalendarClock, tone: 'sky', req: { type: 'class' } },
  { label: 'Exam', hint: 'Exam, quiz or presentation', icon: BookOpen, tone: 'pink', req: { type: 'exam' } },
]

export function QuickAddSheet({ onClose }: { onClose: () => void }) {
  const open = useSheets()
  return (
    <Sheet open onClose={onClose} title="Add">
      <div className="grid grid-cols-2 gap-2.5 pb-2">
        {ITEMS.map(({ label, hint, icon, tone, req }) => (
          <button
            key={label}
            type="button"
            onClick={() => open(req)}
            className="press flex flex-col items-start gap-3 rounded-[26px] border border-line bg-surface-2 p-4 text-left active:bg-surface-3"
          >
            <span className="flex w-full items-center justify-between">
              <IconCircle icon={icon} tone={tone} />
              <ChevronRight className="size-4 text-ink-3" aria-hidden />
            </span>
            <span>
              <span className="block text-[16px] font-semibold">{label}</span>
              <span className="mt-0.5 block text-[13px] leading-snug text-ink-2">{hint}</span>
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  )
}
