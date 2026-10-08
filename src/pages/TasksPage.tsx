import { createContext, useContext, useState, type ReactNode } from 'react'
import { CircleCheck, Plus } from 'lucide-react'
import { useClock } from '@/app/contexts'
import { Page } from '@/components/layout/Page'
import { IconButton } from '@/components/ui/Button'
import { HeroCard } from '@/components/ui/HeroCard'
import { Chips } from '@/components/ui/choice'
import { EmptyState, ErrorNotice, List, Loading, ProgressBar, Section } from '@/components/ui/display'
import { Select } from '@/components/ui/fields'
import { groupTasks, type TaskFilter } from '@/domain/tasks'
import { useSheets } from '@/features/sheets/SheetsContext'
import { TaskDetails } from '@/features/tasks/TaskDetails'
import { TaskRow } from '@/features/tasks/TaskRow'
import { useSubjects, useTasks } from '@/hooks/data'
import { useMediaQuery, WIDE } from '@/hooks/useMediaQuery'
import type { Task } from '@/types/models'
import { relativeDay } from '@/utils/dates'

/** On tablets, rows select a task for the details pane instead of opening the edit sheet. */
const Selection = createContext<{ selectedId: string | undefined; select: (t: Task) => void } | null>(null)

export function TasksPage() {
  const { today, time } = useClock()
  const open = useSheets()
  const { data: tasks, isPending, error, refetch } = useTasks()
  const { data: subjects = [] } = useSubjects()
  const [filter, setFilter] = useState<TaskFilter>('today')
  const [subjectId, setSubjectId] = useState('')
  const wide = useMediaQuery(WIDE)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const visible = (tasks ?? []).filter((t) => !subjectId || t.subjectId === subjectId)
  const g = groupTasks(visible, today, time)

  const options: Array<{ value: TaskFilter; label: string }> = [
    { value: 'today', label: 'Today' },
    { value: 'upcoming', label: 'Upcoming' },
    { value: 'overdue', label: g.overdue.length ? `Overdue · ${g.overdue.length}` : 'Overdue' },
    { value: 'completed', label: 'Done' },
  ]

  // The task shown beside the list: the one tapped, or the first one in the current view.
  const shown: Task[] =
    filter === 'today'
      ? [...g.overdue, ...g.today, ...g.doneToday]
      : filter === 'upcoming'
        ? [...g.upcoming, ...g.someday]
        : filter === 'overdue'
          ? g.overdue
          : g.completed
  const selected = shown.find((t) => t.id === selectedId) ?? shown[0]

  const add = () => open({ type: 'task', subjectId: subjectId || undefined, dueDate: filter === 'today' ? today : undefined })

  return (
    <Page
      title="Tasks"
      wide={wide}
      actions={
        <IconButton label="Add task" tone="accent" data-tour="tasks-add" onClick={add}>
          <Plus className="size-5" />
        </IconButton>
      }
    >
      <div className={wide ? 'mb-6 flex items-center justify-between gap-4' : 'mb-6 flex flex-col gap-2.5'}>
        <Chips scroll label="Show" options={options} value={filter} onChange={setFilter} />
        {subjects.length > 0 && (
          <Select
            compact
            aria-label="Filter by subject"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
          >
            <option value="">All subjects</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        )}
      </div>

      <MasterDetail
        wide={wide && !isPending && !error}
        selectedId={selected?.id}
        onSelect={(t) => setSelectedId(t.id)}
        detail={selected ? <TaskDetails key={selected.id} task={selected} /> : null}
      >
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
            <p className="mt-4 text-center text-footnote text-ink-3">Showing tasks completed in the last 30 days.</p>
          </>
        ) : (
          <EmptyState icon={CircleCheck} title="No completed tasks yet" message="Tick a task's circle to complete it." />
        )}
      </MasterDetail>
    </Page>
  )
}

/** Phone and tablet portrait: just the list. Tablet landscape: list | details of the selected task. */
function MasterDetail({
  wide,
  selectedId,
  onSelect,
  detail,
  children,
}: {
  wide: boolean
  selectedId: string | undefined
  onSelect: (t: Task) => void
  detail: ReactNode
  children: ReactNode
}) {
  if (!wide) return <>{children}</>
  return (
    <Selection.Provider value={{ selectedId, select: onSelect }}>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-8">
        <div className="min-w-0">{children}</div>
        <div className="sticky top-24 min-w-0">{detail}</div>
      </div>
    </Selection.Provider>
  )
}

function TaskList({ tasks, showDate = true }: { tasks: Task[]; showDate?: boolean }) {
  const selection = useContext(Selection)
  return (
    <List>
      {tasks.map((t) => (
        <TaskRow
          key={t.id}
          task={t}
          showDate={showDate}
          onSelect={selection?.select}
          selected={selection ? selection.selectedId === t.id : undefined}
        />
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
      <HeroCard tone="lime" art={CircleCheck} footer={<ProgressBar value={pct} onColor label={`${Math.round(pct)}% of today's tasks done`} />}>
        <p className="text-footnote font-semibold text-ink-2">Today's progress</p>
        <p className="tabular mt-1 text-large-title leading-none font-bold">
          {done.length}
          <span className="text-headline text-ink-2"> / {total} done</span>
        </p>
      </HeroCard>
      {overdue.length > 0 && (
        <Section title="Overdue" count={overdue.length} countTone="danger">
          <TaskList tasks={overdue} />
        </Section>
      )}
      {today.length > 0 && (
        <Section title="Today" count={today.length}>
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
        <Section key={date} title={relativeDay(date, todayISO)} count={list.length}>
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
