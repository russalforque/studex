import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { BookOpen, CalendarDays, CalendarSearch, Clock, MapPin, Plus, ReceiptText, Timer, TriangleAlert } from 'lucide-react'
import { useClock, useSettings } from '@/app/contexts'
import { Page } from '@/components/layout/Page'
import { IconButton } from '@/components/ui/Button'
import { Segmented } from '@/components/ui/choice'
import { EmptyState, ErrorNotice, List, Loading, MetaChip, Row, Section, SubjectBadge } from '@/components/ui/display'
import { buildAgenda, type AgendaItem, type TimedAgendaItem } from '@/domain/agenda'
import { findConflicts, slotsForDay } from '@/domain/schedule'
import { EXAM_KIND_LABEL } from '@/features/exams/labels'
import { useSheets } from '@/features/sheets/SheetsContext'
import { TaskRow } from '@/features/tasks/TaskRow'
import { useExams, usePlanned, useSlots, useStudySessions, useTasks } from '@/hooks/data'
import { useMediaQuery, WIDE } from '@/hooks/useMediaQuery'
import type { ClassSlotView } from '@/types/models'
import { cn } from '@/utils/cn'
import {
  addDays,
  dayOfWeek,
  formatDate,
  formatDuration,
  formatTime,
  formatTimeRange,
  relativeDay,
  timeToMinutes,
  WEEK_ORDER,
  WEEKDAYS_LONG,
  WEEKDAYS_SHORT,
} from '@/utils/dates'
import { formatMoney } from '@/utils/money'

export function SchedulePage() {
  const { today } = useClock()
  const open = useSheets()
  const { data: slots, isPending, error, refetch } = useSlots()
  const [view, setView] = useState<'day' | 'week'>('day')
  const [selected, setSelected] = useState(today)
  // Tablet landscape shows the day and the whole week side by side, so the toggle goes away.
  const wide = useMediaQuery(WIDE)

  return (
    <Page
      title="Schedule"
      wide={wide}
      actions={
        <IconButton label="Add class" tone="accent" data-tour="schedule-add" onClick={() => open({ type: 'class', day: dayOfWeek(selected) })}>
          <Plus className="size-5" />
        </IconButton>
      }
    >
      {!wide && (
        <Segmented
          label="View"
          className="mb-6"
          value={view}
          onChange={setView}
          options={[
            { value: 'day', label: 'Day' },
            { value: 'week', label: 'Week' },
          ]}
        />
      )}
      {isPending ? (
        <Loading />
      ) : error ? (
        <ErrorNotice message="Your schedule couldn't be loaded." onRetry={() => void refetch()} />
      ) : wide ? (
        <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] items-start gap-8">
          <div className="min-w-0">
            <DayView slots={slots} today={today} selected={selected} onSelect={setSelected} />
          </div>
          <Section title="This week" className="min-w-0">
            <div>
              <WeekView slots={slots} />
            </div>
          </Section>
        </div>
      ) : view === 'day' ? (
        <DayView slots={slots} today={today} selected={selected} onSelect={setSelected} />
      ) : (
        <WeekView slots={slots} />
      )}
    </Page>
  )
}

function DayView({
  slots,
  today,
  selected,
  onSelect,
}: {
  slots: ClassSlotView[]
  today: string
  selected: string
  onSelect: (d: string) => void
}) {
  const { data: tasks = [] } = useTasks()
  const { data: exams = [] } = useExams()
  const { data: planned = [] } = usePlanned()
  const { data: sessions = [] } = useStudySessions(selected, selected)
  // A rolling week from today, so "Tomorrow" is always one tap away; any other date from the picker.
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i))
  const dueDates = new Set([
    ...tasks.filter((t) => t.status !== 'completed' && t.dueDate).map((t) => t.dueDate!),
    ...exams.filter((e) => e.studyStatus !== 'completed').map((e) => e.date),
  ])
  const agenda = buildAgenda({ date: selected, today, slots, tasks, exams, sessions, planned })
  const rel = relativeDay(selected, today)
  const dow = dayOfWeek(selected)
  const outsideStrip = !days.includes(selected)

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-headline font-semibold">Day plan</h2>
        <label className="press card relative inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-footnote font-semibold">
          <CalendarSearch className="size-4 text-ink-2" aria-hidden />
          {outsideStrip ? formatDate(selected, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Other date'}
          {/* The native picker sits invisibly over the chip so the whole chip opens it. */}
          <input
            type="date"
            aria-label="Choose a date"
            value={selected}
            onChange={(e) => e.target.value && onSelect(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
      </div>
      <div role="tablist" aria-label="Day" data-tour="schedule-days" className="mb-7 grid grid-cols-7 gap-1.5">
        {days.map((d) => {
          const active = d === selected
          const count = Math.min(4, slots.filter((s) => s.dayOfWeek === dayOfWeek(d)).length)
          const due = dueDates.has(d)
          return (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={`${relativeDay(d, today)}${due ? ', something due' : ''}`}
              onClick={() => onSelect(d)}
              className={cn(
                'press flex h-20 flex-col items-center justify-center gap-0.5 rounded-full border',
                active ? 'border-accent bg-accent text-accent-ink' : d === today ? 'border-ink bg-surface text-ink' : 'border-line bg-surface text-ink',
              )}
            >
              <span className={cn('text-caption-2 font-medium', active ? 'text-accent-ink' : 'text-ink-2')}>{WEEKDAYS_SHORT[dayOfWeek(d)]}</span>
              <span className="tabular text-headline font-bold">{Number(d.slice(8))}</span>
              <span className="flex h-1.5 gap-0.5" aria-hidden>
                {Array.from({ length: count }, (_, i) => (
                  <span key={i} className={cn('size-1 rounded-full', active ? 'bg-accent-ink' : 'bg-ink-3')} />
                ))}
                {due && <span className={cn('size-1 rounded-full', active ? 'bg-accent-ink' : 'bg-warn')} />}
              </span>
            </button>
          )
        })}
      </div>

      <Section
        title={selected === today ? "Today's plan" : 'Plan'}
        action={<MetaChip icon={CalendarDays}>{rel === WEEKDAYS_LONG[dow] ? rel : `${rel} · ${WEEKDAYS_LONG[dow]}`}</MetaChip>}
      >
        {agenda.timed.length === 0 && agenda.anytime.length === 0 ? (
          <EmptyState compact tone="mint" title={slots.length === 0 ? 'No classes yet' : 'Nothing planned'} message={selected === today ? 'Enjoy the free time.' : undefined} />
        ) : agenda.timed.length === 0 ? (
          <p className="px-1 text-subhead text-ink-3">No classes or timed events.</p>
        ) : (
          <Timeline items={agenda.timed} isToday={selected === today} />
        )}
      </Section>

      {agenda.anytime.length > 0 && (
        <Section title="Anytime" count={agenda.anytime.length}>
          <List>
            {agenda.anytime.map((item) => (
              <AnytimeItem key={item.key} item={item} today={today} />
            ))}
          </List>
        </Section>
      )}
    </>
  )
}

/** Timed items in order, with the free time between consecutive classes. */
function Timeline({ items, isToday }: { items: TimedAgendaItem[]; isToday: boolean }) {
  const { time } = useClock()
  const nowMin = timeToMinutes(time)

  const rows: ReactNode[] = []
  let lastClassEnd: string | null = null
  for (const item of items) {
    if (item.kind === 'class') {
      const gap = lastClassEnd ? timeToMinutes(item.time) - timeToMinutes(lastClassEnd) : 0
      if (gap >= 30) {
        rows.push(
          <li key={`gap-${item.key}`} className="flex items-center gap-3 py-1.5">
            <span className="w-14 shrink-0" />
            <span className="dashed-line h-px flex-1" aria-hidden />
            <span className="text-caption font-medium text-ink-3">Free · {formatDuration(gap)}</span>
            <span className="dashed-line h-px w-6" aria-hidden />
          </li>,
        )
      }
      if (!lastClassEnd || item.endTime > lastClassEnd) lastClassEnd = item.endTime
    }
    const live = isToday && item.kind === 'class' && timeToMinutes(item.time) <= nowMin && nowMin < timeToMinutes(item.endTime)
    const past = isToday && item.kind === 'class' && timeToMinutes(item.endTime) <= nowMin
    rows.push(
      <li key={item.key}>
        <TimedItem item={item} live={live} past={past} />
      </li>,
    )
  }

  return <ol>{rows}</ol>
}

function TimedItem({ item, live, past }: { item: TimedAgendaItem; live: boolean; past: boolean }) {
  const open = useSheets()
  const navigate = useNavigate()
  const [clock, meridiem] = formatTime(item.time).split(' ')

  let body: { leading: ReactNode; title: string; detail: string; onClick: () => void; badge?: string }
  switch (item.kind) {
    case 'class':
      body = {
        leading: <SubjectBadge color={item.slot.subjectColor} name={item.slot.subjectName} />,
        title: item.slot.subjectName,
        detail: [formatTimeRange(item.slot.startTime, item.slot.endTime), item.slot.displayRoom].filter(Boolean).join(' · '),
        onClick: () => open({ type: 'class', slot: item.slot }),
      }
      break
    case 'exam':
      body = {
        leading: <KindIcon icon={BookOpen} className="bg-warn-soft text-warn" />,
        title: item.exam.title,
        detail: [EXAM_KIND_LABEL[item.exam.kind], item.exam.subjectName].filter(Boolean).join(' · '),
        onClick: () => open({ type: 'exam', exam: item.exam }),
      }
      break
    case 'task':
      body = {
        leading: <KindIcon icon={Clock} className="bg-lilac text-lilac-ink" />,
        title: item.task.title,
        detail: [item.task.status === 'completed' ? 'Done' : 'Due', item.task.subjectName].filter(Boolean).join(' · '),
        onClick: () => open({ type: 'task', task: item.task }),
      }
      break
    case 'study':
      body = {
        leading: <KindIcon icon={Timer} className="bg-mint text-mint-ink" />,
        title: item.session.subjectName ? `Studied ${item.session.subjectName}` : 'Focus session',
        detail: `${formatDuration(Math.round(item.session.focusedSeconds / 60))}${item.session.status === 'interrupted' ? ' · ended early' : ''}`,
        onClick: () => navigate('/focus'),
      }
      break
  }

  return (
    <div className={cn('flex items-start gap-3 py-1.5', past && 'opacity-55')}>
      <div className="tabular w-14 shrink-0 pt-3 leading-tight">
        <p className="text-subhead font-semibold">{clock}</p>
        {meridiem && <p className="text-caption-2 font-medium text-ink-3">{meridiem}</p>}
      </div>
      <div className="min-w-0 flex-1">
        <span className="dashed-line mb-2 block h-px" aria-hidden />
        <button
          type="button"
          onClick={body.onClick}
          className={cn(
            'press flex w-full items-center gap-3 rounded-full border py-1.5 pr-4 pl-1.5 text-left',
            live ? 'hero-mint border-transparent' : 'card active:bg-surface-2',
          )}
        >
          {body.leading}
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate text-body font-semibold">{body.title}</span>
              {live && <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-caption-2 font-bold text-accent-ink">Now</span>}
            </span>
            <span className="tabular block truncate text-caption text-ink-2">{body.detail}</span>
          </span>
        </button>
      </div>
    </div>
  )
}

function AnytimeItem({ item, today }: { item: AgendaItem; today: string }) {
  const open = useSheets()
  const navigate = useNavigate()
  const { currency } = useSettings()
  switch (item.kind) {
    case 'task':
      return <TaskRow task={item.task} showDate={item.overdue} />
    case 'exam':
      return (
        <Row
          onClick={() => open({ type: 'exam', exam: item.exam })}
          leading={<SubjectBadge color={item.exam.subjectColor} name={item.exam.subjectName ?? item.exam.title} />}
          title={item.exam.title}
          subtitle={
            <span className="flex gap-1.5 pt-0.5">
              <MetaChip tone="warn">{EXAM_KIND_LABEL[item.exam.kind]}</MetaChip>
              {item.exam.topicsTotal > 0 && (
                <MetaChip>
                  {item.exam.topicsDone}/{item.exam.topicsTotal} topics
                </MetaChip>
              )}
            </span>
          }
        />
      )
    case 'planned':
      return (
        <Row
          onClick={() => navigate('/budget/planned')}
          leading={<KindIcon icon={ReceiptText} className="size-11 bg-peach text-peach-ink" />}
          title={item.planned.title}
          subtitle={`Pay ${formatMoney(item.planned.amount, currency)}${item.planned.dueDate && item.planned.dueDate < today ? ' · overdue' : ''}`}
          chevron
        />
      )
    default:
      return null
  }
}

function KindIcon({ icon: Icon, className }: { icon: typeof Clock; className: string }) {
  return (
    <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-full', className)} aria-hidden>
      <Icon className="size-5" strokeWidth={1.9} />
    </span>
  )
}

function WeekView({ slots }: { slots: ClassSlotView[] }) {
  const open = useSheets()
  const conflicts = findConflicts(slots)
  if (slots.length === 0) {
    return (
      <EmptyState
        icon={CalendarDays}
        tone="sky"
        title="No classes yet"
        message="Add your classes once and Studex shows what's next every day."
        action={{ label: 'Add class', onClick: () => open({ type: 'class' }) }}
      />
    )
  }
  return (
    <>
      {conflicts.length > 0 && (
        <div role="note" className="mb-2 flex gap-3 rounded-[22px] bg-warn-soft px-4 py-3 text-subhead text-warn">
          <TriangleAlert className="mt-0.5 size-4.5 shrink-0" aria-hidden />
          <div>
            <p className="font-semibold">{conflicts.length === 1 ? 'Two classes overlap' : `${conflicts.length} schedule conflicts`}</p>
            <ul className="mt-1 flex flex-col gap-0.5">
              {conflicts.map((c) => (
                <li key={`${c.a.id}-${c.b.id}`}>
                  {WEEKDAYS_SHORT[c.a.dayOfWeek]}: {c.a.subjectName} and {c.b.subjectName}, {formatDuration(c.minutes)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {WEEK_ORDER.map((d) => {
        const list = slotsForDay(slots, d)
        if (list.length === 0) return null
        return (
          <Section key={d} title={WEEKDAYS_LONG[d]} action={<MetaChip>{list.length} {list.length === 1 ? 'class' : 'classes'}</MetaChip>}>
            <List>
              {list.map((s) => (
                <Row
                  key={s.id}
                  onClick={() => open({ type: 'class', slot: s })}
                  leading={<SubjectBadge color={s.subjectColor} name={s.subjectName} />}
                  title={s.subjectName}
                  subtitle={
                    <span className="flex gap-1.5 pt-0.5">
                      <MetaChip icon={Clock}>{formatTimeRange(s.startTime, s.endTime)}</MetaChip>
                      {s.displayRoom && <MetaChip icon={MapPin}>{s.displayRoom}</MetaChip>}
                    </span>
                  }
                />
              ))}
            </List>
          </Section>
        )
      })}
    </>
  )
}
