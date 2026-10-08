import { CalendarDays, Check, Clock, Flag } from 'lucide-react'
import { useClock, useRepos } from '@/app/contexts'
import { MetaChip, SubjectDot } from '@/components/ui/display'
import { useSheets } from '@/features/sheets/SheetsContext'
import { isOverdue } from '@/domain/tasks'
import { useAction } from '@/hooks/useAction'
import type { Task } from '@/types/models'
import { cn } from '@/utils/cn'
import { formatTime, relativeDay } from '@/utils/dates'

/** One task card: tap the circle to complete it, tap the text to edit. */
export function TaskRow({ task, showDate = true, showSubject = true }: { task: Task; showDate?: boolean; showSubject?: boolean }) {
  const repos = useRepos()
  const open = useSheets()
  const { today, time } = useClock()
  const done = task.status === 'completed'
  const overdue = isOverdue(task, today, time)
  const toggle = useAction(
    () => repos.tasks.setStatus(task.id, done ? 'todo' : 'completed'),
    ['tasks'],
  )

  const showDue = !!task.dueDate && (showDate || overdue)
  const hasMeta = (showSubject && task.subjectName) || showDue || task.dueTime || task.status === 'in_progress'

  return (
    <div className={cn('card flex min-h-16 items-center gap-1 rounded-[26px] py-1.5 pr-3 pl-1.5', done && 'opacity-70')}>
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={done ? `Mark “${task.title}” as not done` : `Complete “${task.title}”`}
        onClick={() => toggle.fire()}
        disabled={toggle.pending}
        className="flex size-12 shrink-0 items-center justify-center"
      >
        <span
          className={cn(
            'flex size-7.5 items-center justify-center rounded-full border-[1.5px] transition-colors',
            done ? 'animate-pop border-accent bg-accent text-accent-ink' : overdue ? 'border-danger bg-danger-soft' : 'border-surface-3 bg-surface-2',
          )}
        >
          {done && <Check className="size-4" strokeWidth={3} aria-hidden />}
        </span>
      </button>
      <button type="button" onClick={() => open({ type: 'task', task })} className="press min-w-0 flex-1 py-2 text-left">
        <span className={cn('flex items-center gap-2 text-[15px] leading-snug font-semibold', done && 'text-ink-3 line-through')}>
          <span className="truncate">{task.title}</span>
          {task.priority === 'high' && !done && (
            <Flag className="size-3.5 shrink-0 fill-warn text-warn" aria-label="High priority" />
          )}
        </span>
        {hasMeta && (
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {showSubject && task.subjectName && (
              <span className="inline-flex min-w-0 items-center gap-1.5 text-[12px] font-medium text-ink-2">
                <SubjectDot color={task.subjectColor} className="size-2" />
                <span className="max-w-36 truncate">{task.subjectName}</span>
              </span>
            )}
            {showDue && (
              <MetaChip icon={CalendarDays} tone={overdue ? 'danger' : 'neutral'}>
                {overdue ? `Overdue · ${relativeDay(task.dueDate!, today)}` : relativeDay(task.dueDate!, today)}
              </MetaChip>
            )}
            {!showDue && overdue && <MetaChip tone="danger">Overdue</MetaChip>}
            {task.dueTime && <MetaChip icon={Clock}>{formatTime(task.dueTime)}</MetaChip>}
            {task.status === 'in_progress' && <MetaChip tone="lilac">In progress</MetaChip>}
          </span>
        )}
      </button>
    </div>
  )
}
