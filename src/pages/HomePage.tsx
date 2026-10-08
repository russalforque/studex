import { Link } from 'react-router'
import { ArrowUpRight, CalendarClock, CalendarDays, Clock, GraduationCap, Plus, ShieldCheck, Wallet } from 'lucide-react'
import { useClock, useSettings } from '@/app/contexts'
import { Fab } from '@/components/layout/Fab'
import { Page } from '@/components/layout/Page'
import { Button } from '@/components/ui/Button'
import { HeroCard, HeroPill } from '@/components/ui/HeroCard'
import { EmptyState, List, MetaChip, ProgressBar, Row, Section, SectionLink, SubjectBadge } from '@/components/ui/display'
import { periodNoun } from '@/domain/periods'
import { findNextClass } from '@/domain/schedule'
import { groupTasks } from '@/domain/tasks'
import { paceMessage } from '@/features/budget/budgetCopy'
import { EXAM_KIND_LABEL } from '@/features/exams/labels'
import { useSheets } from '@/features/sheets/SheetsContext'
import { TaskRow } from '@/features/tasks/TaskRow'
import { useCurrentBudget, useExams, useSlots, useTasks } from '@/hooks/data'
import { addDays, formatDate, formatDuration, formatTime, formatTimeRange, greeting, relativeDay, timeToMinutes } from '@/utils/dates'
import { cn } from '@/utils/cn'
import { formatMoney } from '@/utils/money'

const TODAY_LIMIT = 6

export function HomePage() {
  const { now, today, time } = useClock()
  const settings = useSettings()
  const open = useSheets()
  const firstName = settings.studentName.trim().split(/\s+/)[0] ?? ''

  return (
    <Page
      header={
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-ink-2">
            {greeting(now)} · {formatDate(today, { weekday: 'short', month: 'short', day: 'numeric' })}
          </p>
          <h1 className="truncate text-[26px] leading-tight font-bold tracking-tight">{firstName}</h1>
        </div>
      }
      actions={
        <Link
          to="/settings"
          aria-label="Profile and settings"
          className="press flex size-12 items-center justify-center rounded-full border-2 border-surface bg-linear-to-br from-lilac to-pink text-[18px] font-bold text-lilac-ink shadow-card"
        >
          {firstName.slice(0, 1).toUpperCase() || '·'}
        </Link>
      }
      fab
    >
      <NextClass today={today} time={time} />
      <TodaySection today={today} time={time} />
      <Upcoming today={today} />
      <BudgetGlance />
      <Fab label="Quick add" onClick={() => open({ type: 'quickAdd' })} />
    </Page>
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
          <p className="text-[22px] leading-tight font-bold tracking-tight">Add your class schedule</p>
          <p className="mt-1.5 text-[14px] text-ink-2">See your next class here every day.</p>
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
    <Section title={live ? "Today's class" : 'Next class'}>
      <Link to="/schedule" className="press block">
        <HeroCard tone="mint" art={GraduationCap}>
          <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-2">
            <span className={cn('size-2 rounded-full', live ? 'animate-pulse bg-mint-ink' : 'bg-ink-3')} aria-hidden />
            {statusText}
          </p>
          <p className="mt-1.5 line-clamp-2 text-[22px] leading-tight font-bold tracking-tight">{slot.subjectName}</p>
          {details && <p className="mt-1 truncate text-[14px] text-ink-2">{details}</p>}
          {live && (
            <div className="mt-4">
              <p className="tabular mb-1.5 text-[12px] font-medium text-ink-2">{formatDuration(end - nowMin)} left</p>
              <ProgressBar value={pct} onColor label={`Class ${Math.round(pct)}% done`} />
            </div>
          )}
          <div className="mt-4 flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink" aria-hidden>
              <ArrowUpRight className="size-5" />
            </span>
            <span className="tabular text-[13px] font-semibold">{formatTimeRange(slot.startTime, slot.endTime)}</span>
          </div>
        </HeroCard>
      </Link>
    </Section>
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

  return (
    <Section
      title="Today"
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
              subtitle={
                <span className="flex gap-1.5 pt-0.5">
                  <MetaChip tone="warn">{EXAM_KIND_LABEL[e.kind]}</MetaChip>
                  {e.time && <MetaChip icon={Clock}>{formatTime(e.time)}</MetaChip>}
                </span>
              }
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

function Upcoming({ today }: { today: string }) {
  const { data: tasks } = useTasks()
  const { data: exams } = useExams()
  const open = useSheets()
  if (!tasks || !exams) return null
  const horizon = addDays(today, 7)

  const items = [
    ...exams
      .filter((e) => e.date > today && e.date <= horizon && e.studyStatus !== 'completed')
      .map((e) => ({ id: e.id, date: e.date, title: e.title, meta: EXAM_KIND_LABEL[e.kind], color: e.subjectColor, subject: e.subjectName, onClick: () => open({ type: 'exam', exam: e }), exam: true })),
    ...tasks
      .filter((t) => t.status !== 'completed' && t.dueDate && t.dueDate > today && t.dueDate <= horizon)
      .map((t) => ({ id: t.id, date: t.dueDate!, title: t.title, meta: 'Due', color: t.subjectColor, subject: t.subjectName, onClick: () => open({ type: 'task', task: t }), exam: false })),
  ]
    // Exams first on the same day: they need preparation.
    .sort((a, b) => a.date.localeCompare(b.date) || Number(b.exam) - Number(a.exam))
    .slice(0, 4)

  if (items.length === 0) return null
  return (
    <Section title="Upcoming" action={<SectionLink to="/exams">Exams</SectionLink>}>
      <List>
        {items.map((i) => (
          <Row
            key={i.id}
            onClick={i.onClick}
            leading={<SubjectBadge color={i.color} name={i.subject ?? i.title} />}
            title={i.title}
            subtitle={
              <span className="flex gap-1.5 pt-0.5">
                <MetaChip tone={i.exam ? 'warn' : 'neutral'}>{i.meta}</MetaChip>
                <MetaChip icon={CalendarDays}>{relativeDay(i.date, today)}</MetaChip>
              </span>
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
          <p className="text-[20px] leading-tight font-bold tracking-tight">Set up your allowance</p>
          <p className="mt-1.5 text-[14px] text-ink-2">Know how much you can safely spend each day.</p>
          <Button className="mt-4" onClick={() => open({ type: 'allowance' })}>
            Set up
          </Button>
        </HeroCard>
      </Section>
    )
  }
  const { summary: s, plan } = budget
  const msg = paceMessage(s, plan.frequency, currency)
  return (
    <Section title="Budget" action={<SectionLink to="/budget">Details</SectionLink>}>
      <Link to="/budget" className="press block">
        <HeroCard tone="pink" art={Wallet}>
          <HeroPill icon={ShieldCheck}>{formatMoney(s.safeToSpendToday, currency)} safe today</HeroPill>
          <p className={cn('tabular mt-4 text-[32px] leading-none font-bold tracking-tight', s.remaining < 0 && 'text-danger')}>
            {formatMoney(s.remaining, currency)}
          </p>
          <p className="mt-1.5 text-[14px] text-ink-2">left {periodNoun(plan.frequency)}</p>
          {msg && <p className={cn('mt-3 text-[13px] font-medium', msg.tone === 'warn' ? 'text-warn' : 'text-ink-2')}>{msg.text}</p>}
        </HeroCard>
      </Link>
    </Section>
  )
}
