import { useState } from 'react'
import { CircleCheck, Plus } from 'lucide-react'
import { useClock } from '@/app/contexts'
import { Page } from '@/components/layout/Page'
import { IconButton } from '@/components/ui/Button'
import { HeroCard } from '@/components/ui/HeroCard'
import { Chips } from '@/components/ui/choice'
import { EmptyState, ErrorNotice, List, Loading, MetaChip, ProgressBar, Section } from '@/components/ui/display'
import { Select } from '@/components/ui/fields'
import { groupTasks, type TaskFilter } from '@/domain/tasks'
import { useSheets } from '@/features/sheets/SheetsContext'
import { TaskRow } from '@/features/tasks/TaskRow'
import { useSubjects, useTasks } from '@/hooks/data'
import type { Task } from '@/types/models'
import { relativeDay } from '@/utils/dates'

export function TasksPage() {
  const { today, time } = useClock()
  const open = useSheets()
  const { data: tasks, isPending, error, refetch } = useTasks()
  const { data: subjects = [] } = useSubjects()
  const [filter, setFilter] = useState<TaskFilter>('today')
  const [subjectId, setSubjectId] = useState('')

  const visible = (tasks ?? []).filter((t) => !subjectId || t.subjectId === subjectId)
  const g = groupTasks(visible, today, time)

  const options: Array<{ value: TaskFilter; label: string }> = [
    { value: 'today', label: 'Today' },
    { value: 'upcoming', label: 'Upcoming' },
    { value: 'overdue', label: g.overdue.length ? `Overdue · ${g.overdue.length}` : 'Overdue' },
    { value: 'completed', label: 'Done' },
  ]

  const add = () => open({ type: 'task', subjectId: subjectId || undefined, dueDate: filter === 'today' ? today : undefined })

  return (
    <Page
      title="Tasks"
      actions={
        <IconButton label="Add task" tone="accent" onClick={add}>
          <Plus className="size-5" />
        </IconButton>
      }
    >
      <div className="mb-6 flex flex-col gap-3">
        <Chips label="Show" options={options} value={filter} onChange={setFilter} />
        {subjects.length > 0 && (
          <Select aria-label="Filter by subject" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            <option value="">All subjects</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        )}
      </div>

      {isPending ? (
        <Loading />
      ) : error ? (
        <ErrorNotice message="Your tasks couldn't be loaded." onRetry={() => void refetch()} />
      ) : filter === 'today' ? (
        <TodayView overdue={g.overdue} today={g.today} done={g.doneToday} onAdd={add} />
      ) : filter === 'upcoming' ? (
        <UpcomingView tasks={g.upcoming} someday={g.someday} todayISO={today} onAdd={add} />
      ) : filter === 'overdue' ? (
        g.overdue.length ? (
          <TaskList tasks={g.overdue} />
        ) : (
          <EmptyState tone="mint" icon={CircleCheck} title="Nothing overdue" message="Everything is on time." />
        )
      ) : g.completed.length ? (
        <>
          <TaskList tasks={g.completed} />
          <p className="mt-4 text-center text-[13px] text-ink-3">Showing tasks completed in the last 30 days.</p>
        </>
      ) : (
        <EmptyState icon={CircleCheck} title="No completed tasks yet" message="Tick a task's circle to complete it." />
      )}
    </Page>
  )
}

function TaskList({ tasks, showDate = true }: { tasks: Task[]; showDate?: boolean }) {
  return (
    <List>
      {tasks.map((t) => (
        <TaskRow key={t.id} task={t} showDate={showDate} />
      ))}
    </List>
  )
}

function TodayView({ overdue, today, done, onAdd }: { overdue: Task[]; today: Task[]; done: Task[]; onAdd: () => void }) {
  if (!overdue.length && !today.length && !done.length) {
    return (
      <EmptyState tone="mint" icon={CircleCheck} title="No tasks today" message="You're all caught up." action={{ label: 'Add task', onClick: onAdd }} />
    )
  }
  const total = overdue.length + today.length + done.length
  const pct = (done.length / total) * 100
  return (
    <>
      <HeroCard tone="lime" art={CircleCheck}>
        <p className="text-[13px] font-semibold text-ink-2">Today's progress</p>
        <p className="tabular mt-1 text-[28px] leading-none font-bold tracking-tight">
          {done.length}
          <span className="text-[18px] text-ink-2"> / {total} done</span>
        </p>
        <div className="mt-4">
          <ProgressBar value={pct} onColor label={`${Math.round(pct)}% of today's tasks done`} />
        </div>
      </HeroCard>
      {overdue.length > 0 && (
        <Section title="Overdue" action={<MetaChip tone="danger">{overdue.length}</MetaChip>}>
          <TaskList tasks={overdue} />
        </Section>
      )}
      {today.length > 0 && (
        <Section title="Today" action={<MetaChip>{today.length}</MetaChip>}>
          <TaskList tasks={today} showDate={false} />
        </Section>
      )}
      {done.length > 0 && (
        <Section title="Completed">
          <TaskList tasks={done} showDate={false} />
        </Section>
      )}
    </>
  )
}

function UpcomingView({ tasks, someday, todayISO, onAdd }: { tasks: Task[]; someday: Task[]; todayISO: string; onAdd: () => void }) {
  if (!tasks.length && !someday.length) {
    return <EmptyState title="Nothing coming up" message="Tasks with a future due date show here." action={{ label: 'Add task', onClick: onAdd }} />
  }
  const byDate = new Map<string, Task[]>()
  for (const t of tasks) byDate.set(t.dueDate!, [...(byDate.get(t.dueDate!) ?? []), t])
  return (
    <>
      {[...byDate].map(([date, list]) => (
        <Section key={date} title={relativeDay(date, todayISO)} action={<MetaChip>{list.length}</MetaChip>}>
          <TaskList tasks={list} showDate={false} />
        </Section>
      ))}
      {someday.length > 0 && (
        <Section title="No due date">
          <TaskList tasks={someday} />
        </Section>
      )}
    </>
  )
}
