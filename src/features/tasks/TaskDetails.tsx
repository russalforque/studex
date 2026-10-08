import type { ReactNode } from 'react'
import { CalendarDays, Check, CircleDot, Flag, Pencil, Shapes, type LucideIcon } from 'lucide-react'
import { useClock, useRepos } from '@/app/contexts'
import { Button } from '@/components/ui/Button'
import { MetaChip, SubjectBadge } from '@/components/ui/display'
import { isOverdue } from '@/domain/tasks'
import { AttachmentsField } from '@/features/files/AttachmentsField'
import { useSheets } from '@/features/sheets/SheetsContext'
import { useAction } from '@/hooks/useAction'
import type { Task, TaskStatus } from '@/types/models'
import { cn } from '@/utils/cn'
import { formatDate, formatTime, relativeDay } from '@/utils/dates'
import { KIND_LABEL, PRIORITY_LABEL } from './labels'

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  completed: 'Done',
}

/** The selected task beside the list on tablets. Editing still happens in the task sheet. */
export function TaskDetails({ task }: { task: Task }) {
  const repos = useRepos()
  const open = useSheets()
  const { today, time } = useClock()
  const done = task.status === 'completed'
  const overdue = isOverdue(task, today, time)
  const toggle = useAction(() => repos.tasks.setStatus(task.id, done ? 'todo' : 'completed'), ['tasks'])

  const due = task.dueDate
    ? `${relativeDay(task.dueDate, today)} · ${formatDate(task.dueDate, { weekday: 'long', month: 'long', day: 'numeric' })}${
        task.dueTime ? ` · ${formatTime(task.dueTime)}` : ''
      }`
    : 'No due date'

  return (
    <article className="card rounded-[30px] p-5">
      <div className="flex items-start gap-3">
        <SubjectBadge color={task.subjectColor} name={task.subjectName ?? task.title} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-footnote font-medium text-ink-2">{task.subjectName ?? 'No subject'}</p>
          <h2 className={cn('mt-0.5 text-title-2 leading-tight font-bold', done && 'text-ink-3 line-through')}>
            {task.title}
          </h2>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {overdue && <MetaChip tone="danger">Overdue</MetaChip>}
        {task.priority === 'high' && !done && <MetaChip tone="warn">High priority</MetaChip>}
        {task.status === 'in_progress' && <MetaChip tone="lilac">In progress</MetaChip>}
      </div>

      <dl className="mt-4 flex flex-col">
        <Detail icon={CalendarDays} label="Due">
          <span className={cn(overdue && 'text-danger')}>{due}</span>
        </Detail>
        <Detail icon={CircleDot} label="Status">
          {STATUS_LABEL[task.status]}
        </Detail>
        <Detail icon={Flag} label="Priority">
          {PRIORITY_LABEL[task.priority]}
        </Detail>
        <Detail icon={Shapes} label="Type">
          {KIND_LABEL[task.kind]}
        </Detail>
      </dl>

      <div className="mt-4">
        <p className="label-caps mb-2 pl-1">Notes</p>
        {task.description ? (
          <p className="rounded-[22px] bg-surface-2 px-4 py-3.5 text-body whitespace-pre-wrap text-ink-2">{task.description}</p>
        ) : (
          <p className="px-1 text-subhead text-ink-3">No notes.</p>
        )}
      </div>

      <div className="mt-4">
        <p className="label-caps mb-2 pl-1">Attachments</p>
        <AttachmentsField type="task" targetId={task.id} title={task.title} saved subjectId={task.subjectId} />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-2.5">
        <Button
          size="lg"
          variant={done ? 'secondary' : 'primary'}
          loading={toggle.pending}
          icon={<Check className="size-5" aria-hidden />}
          onClick={() => toggle.fire()}
        >
          {done ? 'Not done' : 'Complete'}
        </Button>
        <Button size="lg" variant="secondary" icon={<Pencil className="size-4.5" aria-hidden />} onClick={() => open({ type: 'task', task })}>
          Edit
        </Button>
      </div>
    </article>
  )
}

function Detail({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-b border-line py-3 last:border-b-0">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2" aria-hidden>
        <Icon className="size-4" />
      </span>
      <dt className="w-20 shrink-0 text-footnote font-medium text-ink-2">{label}</dt>
      <dd className="min-w-0 flex-1 text-body font-medium">{children}</dd>
    </div>
  )
}
