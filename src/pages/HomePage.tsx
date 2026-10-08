import { Link } from 'react-router'
import {
  CalendarClock,
  CalendarDays,
  Check,
  CircleHelp,
  Clock,
  GraduationCap,
  ListChecks,
  Plus,
  Search,
  ShieldCheck,
  Timer,
  Wallet,
} from 'lucide-react'
import { useClock, useRepos, useSettings } from '@/app/contexts'
import { Fab } from '@/components/layout/Fab'
import { Page } from '@/components/layout/Page'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { HeroCard, HeroPill } from '@/components/ui/HeroCard'
import { EmptyState, IconCircle, List, MetaChip, ProgressBar, Row, Section, SectionLink, SubjectBadge } from '@/components/ui/display'
import { classToMark } from '@/domain/attendance'
import { periodNoun } from '@/domain/periods'
import { formatClock, remainingMs } from '@/domain/focus'
import { findNextClass } from '@/domain/schedule'
import { useNow } from '@/features/focus/useFocus'
import { groupTasks } from '@/domain/tasks'
import { paceMessage } from '@/features/budget/budgetCopy'
import { EXAM_KIND_LABEL } from '@/features/exams/labels'
import { useSheets } from '@/features/sheets/SheetsContext'
import { TaskRow } from '@/features/tasks/TaskRow'
import { useAttendanceToday, useCurrentBudget, useExams, useFocusState, useSlots, useStudySessions, useTasks, useWeekSummary } from '@/hooks/data'
import { useAction } from '@/hooks/useAction'
import { useMediaQuery, WIDE } from '@/hooks/useMediaQuery'
import type { AttendanceStatus, Exam } from '@/types/models'
import { addDays, dayOfWeek, dueLabel, formatDate, formatDuration, formatTime, formatTimeRange, greeting, relativeDay, timeToMinutes } from '@/utils/dates'
import { cn } from '@/utils/cn'
import { formatMoney } from '@/utils/money'

const TODAY_LIMIT = 6

export function HomePage() {
  const { now, today, time } = useClock()
  const settings = useSettings()
  const open = useSheets()
  const wide = useMediaQuery(WIDE)
  const firstName = settings.studentName.trim().split(/\s+/)[0] ?? ''

  const academic = (
    <>
      <MarkAttendance today={today} time={time} />
      <NextClass today={today} time={time} />
      <TodaySection today={today} time={time} />
      <FocusGlance today={today} />
    </>
  )
  const planning = (
    <>
      <BudgetGlance />
      <Upcoming today={today} />
      <YourWeek today={today} />
    </>
  )

  return (
    <Page
      wide={wide}
      header={
        <div className="min-w-0 flex-1">
          <p className="truncate text-footnote font-medium text-ink-2">
            {greeting(now)} · {formatDate(today, { weekday: 'short', month: 'short', day: 'numeric' })}
          </p>
          <h1 className="truncate text-large-title leading-tight font-bold">{firstName}</h1>
        </div>
      }
      actions={
        <>
          <Link
            to="/search"
            aria-label="Search"
            className="press card inline-flex size-11 items-center justify-center rounded-full text-ink active:bg-surface-2"
          >
            <Search className="size-5" />
          </Link>
          <Link to="/settings" aria-label="Profile and settings" className="press rounded-full border-2 border-surface shadow-card">
            <Avatar name={settings.studentName} photo={settings.avatar} size={44} />
          </Link>
        </>
      }
      fab
    >
      {wide ? (
        <div className="grid grid-cols-2 items-start gap-8">
          <div>{academic}</div>
          <div>{planning}</div>
        </div>
      ) : (
        <>
          {academic}
          {planning}
        </>
      )}
      <Fab label="Quick add" onClick={() => open({ type: 'quickAdd' })} />
    </Page>
  )
}

/** After a class ends, one tap records how it went. Only the most recent unmarked class is asked about. */
function MarkAttendance({ today, time }: { today: string; time: string }) {
  const repos = useRepos()
  const { data: slots } = useSlots()
  const { data: marked } = useAttendanceToday()
  const mark = useAction(
    (subjectId: string, startTime: string, status: AttendanceStatus) =>
      repos.academics.markAttendance({ subjectId, date: today, startTime, status }),
    ['attendance'],
    { success: 'Attendance saved' },
  )
  if (!slots || !marked) return null
  const slot = classToMark(slots, marked, today, time)
  if (!slot) return null

  const options: Array<{ status: AttendanceStatus; label: string }> = [
    { status: 'present', label: 'Present' },
    { status: 'late', label: 'Late' },
    { status: 'absent', label: 'Absent' },
  ]
  return (
    <Section title="How was class?">
      <div className="card rounded-[26px] p-3">
        <div className="flex items-center gap-3 px-1">
          <SubjectBadge color={slot.subjectColor} name={slot.subjectName} />
          <div className="min-w-0">
            <p className="truncate text-body font-semibold">{slot.subjectName}</p>
            <p className="tabular text-footnote text-ink-2">{formatTimeRange(slot.startTime, slot.endTime)}</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2" role="group" aria-label={`Attendance for ${slot.subjectName}`}>
          {options.map((o) => (
            <button
              key={o.status}
              type="button"
              disabled={mark.pending}
              onClick={() => mark.fire(slot.subjectId, slot.startTime, o.status)}
              className="press min-h-11 rounded-full border border-line bg-surface-2 text-subhead font-semibold active:bg-surface-3 disabled:opacity-50"
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </Section>
  )
}

function NextClass({ today, time }: { today: string; time: string }) {
  const { data: slots } = useSlots()
  const open = useSheets()
  if (!slots) return null
  if (slots.length === 0) {
    return (
      <Section title="Classes">
        <HeroCard tone="mint" art={CalendarClock}>
          <p className="text-title-2 leading-tight font-bold">Add your class schedule</p>
          <p className="mt-1.5 text-subhead text-ink-2">See your next class here every day.</p>
          <Button className="mt-4" icon={<Plus className="size-4" aria-hidden />} onClick={() => open({ type: 'class' })}>
            Add class
          </Button>
        </HeroCard>
      </Section>
    )
  }
  const next = findNextClass(slots, today, time)
  if (!next) return null
  const { slot, date, status } = next
  const live = status === 'now'
  const nowMin = timeToMinutes(time)
  const start = timeToMinutes(slot.startTime)
  const end = timeToMinutes(slot.endTime)
  const statusText = live
    ? 'Live now'
    : date === today
      ? `Starts in ${formatDuration(start - nowMin)}`
      : `${relativeDay(date, today)} · ${formatTime(slot.startTime)}`
  const details = [slot.displayRoom, slot.instructor].filter(Boolean).join(' · ')
  const pct = live ? ((nowMin - start) / Math.max(1, end - start)) * 100 : 0

  return (
    <Section title={live ? "Today's class" : 'Next class'} action={<SectionLink to="/schedule">Schedule</SectionLink>}>
      <Link to="/schedule" className="press block">
        <HeroCard
          tone="mint"
          art={GraduationCap}
          footer={
            live ? (
              <>
                <div className="tabular mb-2 flex items-baseline justify-between gap-3 text-footnote font-medium text-ink-2">
                  <span>{formatTimeRange(slot.startTime, slot.endTime)}</span>
                  <span className="font-semibold text-ink">{formatDuration(end - nowMin)} left</span>
                </div>
                <ProgressBar value={pct} onColor label={`Class ${Math.round(pct)}% done`} />
              </>
            ) : (
              <HeroPill icon={Clock}>{formatTimeRange(slot.startTime, slot.endTime)}</HeroPill>
            )
          }
        >
          <p className="flex items-center gap-1.5 text-footnote font-semibold text-ink-2">
            <span className={cn('size-2 rounded-full', live ? 'animate-pulse bg-mint-ink' : 'bg-ink-3')} aria-hidden />
            {statusText}
          </p>
          <p className="mt-1.5 line-clamp-2 text-title-2 leading-tight font-bold">{slot.subjectName}</p>
          {details && <p className="mt-1 truncate text-subhead text-ink-2">{details}</p>}
        </HeroCard>
      </Link>
    </Section>
  )
}

function ExamChips({ exam: e, today, countdown }: { exam: Exam; today: string; countdown?: boolean }) {
  return (
    <span className="flex flex-wrap gap-1.5 pt-0.5">
      <MetaChip tone="warn">{EXAM_KIND_LABEL[e.kind]}</MetaChip>
      {countdown ? (
        <MetaChip icon={CalendarDays}>{dueLabel(e.date, e.time, today, true)}</MetaChip>
      ) : (
        e.time && <MetaChip icon={Clock}>{formatTime(e.time)}</MetaChip>
      )}
      {e.topicsTotal > 0 && (
        <MetaChip icon={ListChecks} tone={e.topicsDone === e.topicsTotal ? 'lilac' : 'neutral'}>
          {e.topicsDone}/{e.topicsTotal} topics
        </MetaChip>
      )}
    </span>
  )
}

function TodaySection({ today, time }: { today: string; time: string }) {
  const { data: tasks } = useTasks()
  const { data: exams } = useExams()
  const open = useSheets()
  if (!tasks || !exams) return null

  const g = groupTasks(tasks, today, time)
  const examsToday = exams.filter((e) => e.date === today && e.studyStatus !== 'completed')
  const items = [...g.overdue, ...g.today]
  const shown = items.slice(0, TODAY_LIMIT)
  const hidden = items.length - shown.length
  const nothing = items.length === 0 && examsToday.length === 0 && g.doneToday.length === 0
  const due = items.length + examsToday.length

  return (
    <Section
      title={due > 0 ? `Today · ${due} due` : 'Today'}
      action={<SectionLink to="/tasks">{hidden > 0 ? `${hidden} more` : 'All tasks'}</SectionLink>}
    >
      {nothing ? (
        <EmptyState
          compact
          tone="mint"
          title="Nothing due today"
          message="You're all caught up."
          action={{ label: 'Add task', onClick: () => open({ type: 'task' }) }}
        />
      ) : (
        <List>
          {examsToday.map((e) => (
            <Row
              key={e.id}
              onClick={() => open({ type: 'exam', exam: e })}
              leading={<SubjectBadge color={e.subjectColor} name={e.subjectName ?? e.title} />}
              title={e.title}
              subtitle={<ExamChips exam={e} today={today} />}
            />
          ))}
          {shown.map((t) => (
            <TaskRow key={t.id} task={t} showDate={false} />
          ))}
          {g.doneToday.slice(0, 3).map((t) => (
            <TaskRow key={t.id} task={t} showDate={false} />
          ))}
        </List>
      )}
    </Section>
  )
}

/** One row into Focus: the running timer if there is one, otherwise today's study time. */
function FocusGlance({ today }: { today: string }) {
  const { data: state } = useFocusState()
  const { data: sessions = [] } = useStudySessions(today, today)
  const running = !!state && state.runningSince !== null
  const now = useNow(running)
  const minutes = Math.round(sessions.reduce((n, s) => n + s.focusedSeconds, 0) / 60)
  const subtitle = state
    ? `${state.phase === 'break' ? 'Break' : 'Focusing'} · ${state.runningSince === null ? 'paused, ' : ''}${formatClock(remainingMs(state, now))} left`
    : minutes > 0
      ? `${formatDuration(minutes)} studied today`
      : 'Start a study session'
  return (
    <Section>
      <Row to="/focus" leading={<IconCircle icon={Timer} tone="lilac" />} title="Focus" subtitle={subtitle} chevron />
    </Section>
  )
}

function Upcoming({ today }: { today: string }) {
  const { data: tasks } = useTasks()
  const { data: exams } = useExams()
  const open = useSheets()
  if (!tasks || !exams) return null
  const horizon = addDays(today, 7)

  const items = [
    ...exams
      .filter((e) => e.date > today && e.date <= horizon && e.studyStatus !== 'completed')
      .map((e) => ({
        id: e.id,
        date: e.date,
        title: e.title,
        color: e.subjectColor,
        subject: e.subjectName,
        onClick: () => open({ type: 'exam', exam: e }),
        exam: e,
      })),
    ...tasks
      .filter((t) => t.status !== 'completed' && t.dueDate && t.dueDate > today && t.dueDate <= horizon)
      .map((t) => ({
        id: t.id,
        date: t.dueDate!,
        time: t.dueTime,
        title: t.title,
        color: t.subjectColor,
        subject: t.subjectName,
        onClick: () => open({ type: 'task', task: t }),
        exam: null,
      })),
  ]
    // Exams first on the same day: they need preparation.
    .sort((a, b) => a.date.localeCompare(b.date) || Number(!!b.exam) - Number(!!a.exam))
    .slice(0, 5)

  if (items.length === 0) return null
  return (
    <Section title="Coming up" action={<SectionLink to="/exams">Exams</SectionLink>}>
      <List>
        {items.map((i) => (
          <Row
            key={i.id}
            onClick={i.onClick}
            leading={<SubjectBadge color={i.color} name={i.subject ?? i.title} />}
            title={i.title}
            subtitle={
              i.exam ? (
                <ExamChips exam={i.exam} today={today} countdown />
              ) : (
                <span className="flex gap-1.5 pt-0.5">
                  <MetaChip>Due</MetaChip>
                  <MetaChip icon={CalendarDays}>{dueLabel(i.date, 'time' in i ? (i.time ?? null) : null, today)}</MetaChip>
                </span>
              )
            }
          />
        ))}
      </List>
    </Section>
  )
}

function BudgetGlance() {
  const { data: budget, isPending } = useCurrentBudget()
  const { currency } = useSettings()
  const open = useSheets()
  if (isPending) return null
  if (!budget) {
    return (
      <Section title="Budget">
        <HeroCard tone="pink" art={Wallet}>
          <p className="text-title-3 leading-tight font-bold">Set up your allowance</p>
          <p className="mt-1.5 text-subhead text-ink-2">Know how much you can safely spend each day.</p>
          <Button className="mt-4" onClick={() => open({ type: 'allowance' })}>
            Set up
          </Button>
        </HeroCard>
      </Section>
    )
  }
  const { summary: s, plan } = budget
  const msg = paceMessage(s, plan.frequency, currency)
  const usedPct = s.available > 0 ? (s.spent / s.available) * 100 : s.spent > 0 ? 100 : 0
  const tone = s.pace === 'over' ? 'danger' : s.pace === 'fast' ? 'warn' : 'accent'
  // Lead with the number that answers "can I buy this today?"; the period total supports it.
  return (
    <Section title="Budget" action={<SectionLink to="/budget">Details</SectionLink>}>
      <HeroCard
        tone="pink"
        art={Wallet}
        footer={
          <Link to="/budget" className="block">
            <div className="tabular mb-2 flex items-baseline justify-between gap-3 text-footnote text-ink-2">
              <span>
                <span className={cn('font-semibold text-ink', s.remaining < 0 && 'text-danger')}>{formatMoney(s.remaining, currency)}</span>{' '}
                left {periodNoun(plan.frequency)}
              </span>
              <span>of {formatMoney(s.available, currency)}</span>
            </div>
            <ProgressBar value={usedPct} tone={tone} onColor label={`Spent ${Math.round(usedPct)}% of your budget`} />
            {msg && <p className={cn('mt-3 text-footnote font-medium', msg.tone === 'warn' ? 'text-warn' : 'text-ink-2')}>{msg.text}</p>}
          </Link>
        }
      >
        <button
          type="button"
          onClick={() => open({ type: 'safeToSpend' })}
          aria-label={`${formatMoney(s.safeToSpendToday, currency)} safe to spend today. How is this worked out?`}
          className="press -m-1 block rounded-2xl p-1 text-left"
        >
          <span className="flex items-center gap-1.5 text-footnote font-semibold text-ink-2">
            <ShieldCheck className="size-4 text-pink-ink" aria-hidden />
            Safe to spend today
            <CircleHelp className="size-3.5 text-ink-3" aria-hidden />
          </span>
          <span className="tabular mt-1.5 block text-display leading-none font-bold">
            {formatMoney(s.safeToSpendToday, currency)}
          </span>
        </button>
      </HeroCard>
    </Section>
  )
}

/** Friday to Sunday: a calm look back at the week. Informative only, no streaks or scores. */
function YourWeek({ today }: { today: string }) {
  const { currency } = useSettings()
  const show = [5, 6, 0].includes(dayOfWeek(today))
  const { data: w } = useWeekSummary()
  if (!show || !w) return null
  const empty = w.tasksDue === 0 && w.classesMarked === 0 && w.studySeconds === 0 && w.spent === 0 && w.saved === 0 && w.examsAhead === 0
  if (empty) return null

  const stats: Array<{ value: string; label: string; done?: boolean }> = []
  if (w.tasksDue > 0) stats.push({ value: `${w.tasksDone} / ${w.tasksDue}`, label: 'Tasks done', done: w.tasksDone === w.tasksDue })
  if (w.studySeconds > 0) stats.push({ value: formatDuration(Math.round(w.studySeconds / 60)), label: 'Studied' })
  if (w.classesMarked > 0) stats.push({ value: `${w.classesAttended} / ${w.classesMarked}`, label: 'Classes attended' })
  stats.push({ value: formatMoney(w.spent, currency), label: 'Spent' })
  if (w.saved !== 0) stats.push({ value: formatMoney(Math.abs(w.saved), currency), label: w.saved > 0 ? 'Saved' : 'Taken from savings' })
  if (w.examsAhead > 0) stats.push({ value: String(w.examsAhead), label: w.examsAhead === 1 ? 'Exam next week' : 'Exams next week' })

  return (
    <Section title="Your week" action={<SectionLink to="/week">Details</SectionLink>}>
      <dl className="card grid grid-cols-2 gap-x-4 gap-y-4 rounded-[26px] p-4">
        {stats.map(({ value, label, done }) => (
          <div key={label}>
            <dd className="tabular text-title-3 leading-tight font-bold">{value}</dd>
            <dt className="mt-0.5 flex items-center gap-1 text-footnote text-ink-2">
              {done && <Check className="size-3.5 text-ok" aria-hidden />}
              {label}
            </dt>
          </div>
        ))}
      </dl>
    </Section>
  )
}
