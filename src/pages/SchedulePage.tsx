import { useState } from 'react'
import { ArrowUpRight, CalendarDays, Clock, MapPin, Plus } from 'lucide-react'
import { useClock } from '@/app/contexts'
import { Page } from '@/components/layout/Page'
import { IconButton } from '@/components/ui/Button'
import { Segmented } from '@/components/ui/choice'
import { EmptyState, ErrorNotice, List, Loading, MetaChip, Row, Section, SubjectBadge } from '@/components/ui/display'
import { slotsForDay, withFreeTime } from '@/domain/schedule'
import { useSheets } from '@/features/sheets/SheetsContext'
import { useSlots } from '@/hooks/data'
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

export function SchedulePage() {
  const { today } = useClock()
  const open = useSheets()
  const { data: slots, isPending, error, refetch } = useSlots()
  const [view, setView] = useState<'day' | 'week'>('day')
  const [selected, setSelected] = useState(today)

  return (
    <Page
      title="Schedule"
      actions={
        <IconButton label="Add class" tone="accent" onClick={() => open({ type: 'class', day: dayOfWeek(selected) })}>
          <Plus className="size-5" />
        </IconButton>
      }
    >
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
      {isPending ? (
        <Loading />
      ) : error ? (
        <ErrorNotice message="Your schedule couldn't be loaded." onRetry={() => void refetch()} />
      ) : slots.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          tone="sky"
          title="No classes yet"
          message="Add your classes once and Studex shows what's next every day."
          action={{ label: 'Add class', onClick: () => open({ type: 'class' }) }}
        />
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
  const { time } = useClock()
  const open = useSheets()
  // A rolling week from today, so "Tomorrow" is always one tap away.
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i))
  const dow = dayOfWeek(selected)
  const items = withFreeTime(slotsForDay(slots, dow))
  const isToday = selected === today
  const nowMin = timeToMinutes(time)
  const rel = relativeDay(selected, today)

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[17px] font-semibold tracking-tight">Class schedule</h2>
        <span className="card inline-flex min-h-9 items-center rounded-full px-3.5 text-[13px] font-semibold">
          {formatDate(selected, { month: 'short', year: 'numeric' })}
        </span>
      </div>
      <div role="tablist" aria-label="Day" className="mb-7 grid grid-cols-7 gap-1.5">
        {days.map((d) => {
          const active = d === selected
          const count = Math.min(4, slots.filter((s) => s.dayOfWeek === dayOfWeek(d)).length)
          return (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={relativeDay(d, today)}
              onClick={() => onSelect(d)}
              className={cn(
                'press flex h-20 flex-col items-center justify-center gap-0.5 rounded-full border',
                active ? 'border-accent bg-accent text-accent-ink' : d === today ? 'border-ink bg-surface text-ink' : 'border-line bg-surface text-ink',
              )}
            >
              <span className={cn('text-[11px] font-medium', active ? 'text-accent-ink' : 'text-ink-2')}>{WEEKDAYS_SHORT[dayOfWeek(d)]}</span>
              <span className="tabular text-[17px] font-bold">{Number(d.slice(8))}</span>
              <span className="flex h-1.5 gap-0.5" aria-hidden>
                {Array.from({ length: count }, (_, i) => (
                  <span key={i} className={cn('size-1 rounded-full', active ? 'bg-accent-ink' : 'bg-ink-3')} />
                ))}
              </span>
            </button>
          )
        })}
      </div>

      <Section
        title="Timeline"
        action={<MetaChip icon={CalendarDays}>{rel === WEEKDAYS_LONG[dow] ? rel : `${rel} · ${WEEKDAYS_LONG[dow]}`}</MetaChip>}
      >
        {items.length === 0 ? (
          <EmptyState compact tone="mint" title="No classes" message={isToday ? 'Enjoy the free day.' : undefined} />
        ) : (
          <ol>
            {items.map((item) =>
              item.type === 'gap' ? (
                <li key={`gap-${item.from}`} className="flex items-center gap-3 py-1.5">
                  <span className="w-14 shrink-0" />
                  <span className="dashed-line h-px flex-1" aria-hidden />
                  <span className="text-[12px] font-medium text-ink-3">Free · {formatDuration(item.minutes)}</span>
                  <span className="dashed-line h-px w-6" aria-hidden />
                </li>
              ) : (
                <li key={item.slot.id}>
                  <ClassItem
                    slot={item.slot}
                    live={isToday && timeToMinutes(item.slot.startTime) <= nowMin && nowMin < timeToMinutes(item.slot.endTime)}
                    past={isToday && timeToMinutes(item.slot.endTime) <= nowMin}
                    onClick={() => open({ type: 'class', slot: item.slot })}
                  />
                </li>
              ),
            )}
          </ol>
        )}
      </Section>
    </>
  )
}

function ClassItem({ slot, live, past, onClick }: { slot: ClassSlotView; live?: boolean; past?: boolean; onClick: () => void }) {
  const [clock, meridiem] = formatTime(slot.startTime).split(' ')
  return (
    <div className={cn('flex items-start gap-3 py-1.5', past && 'opacity-55')}>
      <div className="tabular w-14 shrink-0 pt-3 leading-tight">
        <p className="text-[14px] font-semibold">{clock}</p>
        {meridiem && <p className="text-[11px] font-medium text-ink-3">{meridiem}</p>}
      </div>
      <div className="min-w-0 flex-1">
        <span className="dashed-line mb-2 block h-px" aria-hidden />
        <button
          type="button"
          onClick={onClick}
          className={cn(
            'press flex w-full items-center gap-3 rounded-full border py-1.5 pr-1.5 pl-1.5 text-left',
            live ? 'hero-mint border-transparent' : 'card active:bg-surface-2',
          )}
        >
          <SubjectBadge color={slot.subjectColor} name={slot.subjectName} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate text-[14.5px] font-semibold">{slot.subjectName}</span>
              {live && <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[10.5px] font-bold text-accent-ink">Now</span>}
            </span>
            <span className="tabular block truncate text-[12px] text-ink-2">
              {[formatTimeRange(slot.startTime, slot.endTime), slot.displayRoom].filter(Boolean).join(' · ')}
            </span>
          </span>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2" aria-hidden>
            <ArrowUpRight className="size-4" />
          </span>
        </button>
      </div>
    </div>
  )
}

function WeekView({ slots }: { slots: ClassSlotView[] }) {
  const open = useSheets()
  return (
    <>
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
