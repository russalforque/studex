import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useClock, useSettings } from '@/app/contexts'
import { Page } from '@/components/layout/Page'
import { IconButton } from '@/components/ui/Button'
import { Loading } from '@/components/ui/display'
import { useWeekSummary } from '@/hooks/data'
import type { WeekSummary } from '@/repositories/insightRepository'
import { addDays, formatDate, formatDuration, startOfWeek } from '@/utils/dates'
import { formatMoney } from '@/utils/money'

/**
 * A calm look at one week, worked out from the records each time. No scores, streaks or
 * comparisons: just what happened.
 */
export function WeekPage() {
  const { today } = useClock()
  const thisWeek = startOfWeek(today)
  const [weekStart, setWeekStart] = useState(thisWeek)
  const { data: w, isPending } = useWeekSummary(weekStart)
  const weekEnd = addDays(weekStart, 6)
  const sameMonth = weekStart.slice(0, 7) === weekEnd.slice(0, 7)
  const label =
    weekStart === thisWeek
      ? 'This week'
      : weekStart === addDays(thisWeek, -7)
        ? 'Last week'
        : `${formatDate(weekStart, { month: 'short', day: 'numeric' })} – ${formatDate(weekEnd, sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' })}`

  return (
    <Page title="Your week" back>
      <div className="mb-5 flex items-center justify-between gap-3">
        <IconButton label="Previous week" onClick={() => setWeekStart(addDays(weekStart, -7))}>
          <ChevronLeft className="size-5" />
        </IconButton>
        <div className="text-center">
          <p className="text-headline font-semibold">{label}</p>
          <p className="text-footnote text-ink-3">
            {formatDate(weekStart, { weekday: 'short', month: 'short', day: 'numeric' })} – {formatDate(weekEnd, { weekday: 'short', month: 'short', day: 'numeric' })}
          </p>
        </div>
        <IconButton label="Next week" disabled={weekStart >= thisWeek} className="disabled:opacity-30" onClick={() => setWeekStart(addDays(weekStart, 7))}>
          <ChevronRight className="size-5" />
        </IconButton>
      </div>
      {isPending || !w ? <Loading /> : <Summary w={w} current={weekStart === thisWeek} />}
    </Page>
  )
}

function Summary({ w, current }: { w: WeekSummary; current: boolean }) {
  const { currency } = useSettings()
  const quiet =
    w.tasksDue === 0 && w.classesMarked === 0 && w.studySeconds === 0 && w.spent === 0 && w.saved === 0 && w.examsInWeek === 0 && w.examsAhead === 0
  if (quiet) {
    return (
      <p className="card rounded-[26px] px-4 py-6 text-center text-subhead text-ink-2">
        {current ? 'Nothing recorded yet this week.' : 'Nothing was recorded this week.'}
      </p>
    )
  }

  const rows: Array<{ label: string; value: string; hint?: string }> = [
    { label: 'Tasks completed', value: w.tasksDue > 0 ? `${w.tasksDone} of ${w.tasksDue}` : String(w.tasksDone) },
    {
      label: 'Study time',
      value: w.studySeconds > 0 ? formatDuration(Math.round(w.studySeconds / 60)) : '–',
      hint: w.studySessions > 0 ? `${w.studySessions} focus session${w.studySessions === 1 ? '' : 's'}` : undefined,
    },
    {
      label: 'Classes attended',
      value: w.classesMarked > 0 ? `${w.classesAttended} of ${w.classesMarked}` : '–',
      hint: w.classesMarked > 0 ? 'Of the classes you marked' : undefined,
    },
    { label: 'Spent', value: formatMoney(w.spent, currency) },
    { label: w.saved < 0 ? 'Taken from savings' : 'Saved', value: formatMoney(Math.abs(w.saved), currency) },
    { label: 'Exams and quizzes', value: String(w.examsInWeek) },
  ]
  if (current) rows.push({ label: 'Coming up in the next 7 days', value: String(w.examsAhead) })

  return (
    <dl className="card rounded-[26px] px-4">
      {rows.map((r) => (
        <div key={r.label} className="flex min-h-14 items-center justify-between gap-4 border-b border-line py-3 last:border-b-0">
          <dt>
            <span className="block text-body">{r.label}</span>
            {r.hint && <span className="block text-footnote text-ink-3">{r.hint}</span>}
          </dt>
          <dd className="tabular shrink-0 text-headline font-bold">{r.value}</dd>
        </div>
      ))}
    </dl>
  )
}
