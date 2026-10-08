import { useState } from 'react'
import { BookOpen, CalendarDays, Clock, ListChecks, Plus } from 'lucide-react'
import { useClock, useRepos } from '@/app/contexts'
import { Page } from '@/components/layout/Page'
import { IconButton } from '@/components/ui/Button'
import { HeroCard, HeroPill } from '@/components/ui/HeroCard'
import { Segmented } from '@/components/ui/choice'
import { EmptyState, ErrorNotice, List, Loading, MetaChip, Pill, ProgressBar, Section, SubjectBadge } from '@/components/ui/display'
import { EXAM_KIND_LABEL, STUDY_LABEL, STUDY_TONE } from '@/features/exams/labels'
import { useSheets } from '@/features/sheets/SheetsContext'
import { useExams } from '@/hooks/data'
import { useMediaQuery, WIDE } from '@/hooks/useMediaQuery'
import { useAction } from '@/hooks/useAction'
import { STUDY_STATUSES, type Exam, type StudyStatus } from '@/types/models'
import { daysBetween, formatShortDate, formatTime, relativeDay } from '@/utils/dates'

export function ExamsPage() {
  const { today } = useClock()
  const open = useSheets()
  const { data: exams, isPending, error, refetch } = useExams()
  const [view, setView] = useState<'upcoming' | 'past'>('upcoming')
  // Tablet landscape lists upcoming and past side by side instead of behind a toggle.
  const wide = useMediaQuery(WIDE)

  const isPast = (e: Exam) => e.date < today || e.studyStatus === 'completed'
  const upcoming = (exams ?? []).filter((e) => !isPast(e))
  const past = (exams ?? []).filter(isPast).reverse()

  return (
    <Page
      title="Exams & quizzes"
      back="/more"
      wide={wide}
      actions={
        <IconButton label="Add exam" tone="accent" onClick={() => open({ type: 'exam' })}>
          <Plus className="size-5" />
        </IconButton>
      }
    >
      {!wide && (
        <Segmented
          label="Show"
          className="mb-6"
          value={view}
          onChange={setView}
          options={[
            { value: 'upcoming', label: 'Upcoming' },
            { value: 'past', label: 'Past' },
          ]}
        />
      )}
      {isPending ? (
        <Loading />
      ) : error ? (
        <ErrorNotice message="Exams couldn't be loaded." onRetry={() => void refetch()} />
      ) : wide ? (
        <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] items-start gap-8">
          <Section title="Upcoming" className="min-w-0">
            <UpcomingExams exams={upcoming} today={today} onAdd={() => open({ type: 'exam' })} />
          </Section>
          <Section title="Past" className="min-w-0">
            <PastExams exams={past} today={today} />
          </Section>
        </div>
      ) : view === 'upcoming' ? (
        <UpcomingExams exams={upcoming} today={today} onAdd={() => open({ type: 'exam' })} />
      ) : (
        <PastExams exams={past} today={today} />
      )}
    </Page>
  )
}

function UpcomingExams({ exams, today, onAdd }: { exams: Exam[]; today: string; onAdd: () => void }) {
  const [first, ...rest] = exams
  if (!first) {
    return (
      <EmptyState
        icon={BookOpen}
        tone="pink"
        title="No upcoming exams"
        message="Add exams, quizzes and presentations to see them on Home as they get close."
        action={{ label: 'Add exam', onClick: onAdd }}
      />
    )
  }
  return (
    <>
      <NextExam exam={first} today={today} />
      {rest.length > 0 && (
        <Section title="Later">
          <List>
            {rest.map((e) => (
              <ExamRow key={e.id} exam={e} today={today} />
            ))}
          </List>
        </Section>
      )}
    </>
  )
}

function PastExams({ exams, today }: { exams: Exam[]; today: string }) {
  if (exams.length === 0) return <EmptyState icon={BookOpen} tone="pink" title="No past exams" />
  return (
    <List>
      {exams.map((e) => (
        <ExamRow key={e.id} exam={e} today={today} />
      ))}
    </List>
  )
}

function countdown(days: number): string {
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  return `In ${days} days`
}

/** The closest exam, shown big like a class card. */
function NextExam({ exam: e, today }: { exam: Exam; today: string }) {
  const open = useSheets()
  const days = daysBetween(today, e.date)
  return (
    <button type="button" onClick={() => open({ type: 'exam', exam: e })} className="press block w-full text-left">
      <HeroCard tone="pink" art={BookOpen}>
        <HeroPill icon={Clock}>
          {countdown(days)}
          {e.time && ` · ${formatTime(e.time)}`}
        </HeroPill>
        <p className="mt-4 line-clamp-2 text-title-2 leading-tight font-bold">{e.title}</p>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <MetaChip icon={CalendarDays} tone="onColor">
            {formatShortDate(e.date, today)}
          </MetaChip>
          <MetaChip tone="onColor">{EXAM_KIND_LABEL[e.kind]}</MetaChip>
        </div>
        <div className="mt-4 flex items-center gap-2.5">
          <SubjectBadge color={e.subjectColor} name={e.subjectName ?? e.title} />
          <div className="min-w-0">
            <p className="truncate text-subhead font-semibold">{e.subjectName ?? 'No subject'}</p>
            <p className="text-caption text-ink-2">{STUDY_LABEL[e.studyStatus]}</p>
          </div>
        </div>
        {e.topicsTotal > 0 && (
          <div className="mt-4">
            <p className="tabular mb-1.5 text-footnote font-medium text-ink-2">
              Study progress · {e.topicsDone} / {e.topicsTotal} topics
            </p>
            <ProgressBar
              value={(e.topicsDone / e.topicsTotal) * 100}
              tone={e.topicsDone === e.topicsTotal ? 'ok' : 'accent'}
              onColor
              label={`${e.topicsDone} of ${e.topicsTotal} topics reviewed`}
            />
          </div>
        )}
      </HeroCard>
    </button>
  )
}

function ExamRow({ exam: e, today }: { exam: Exam; today: string }) {
  const repos = useRepos()
  const open = useSheets()
  const days = daysBetween(today, e.date)
  const next = STUDY_STATUSES[(STUDY_STATUSES.indexOf(e.studyStatus) + 1) % STUDY_STATUSES.length] as StudyStatus
  const cycle = useAction(() => repos.exams.setStudyStatus(e.id, next), ['exams'])
  const soon = days >= 0 && days <= 2 && e.studyStatus === 'not_started'

  return (
    <div className="card flex min-h-16 items-center gap-2 rounded-[26px] py-2 pr-2.5 pl-2.5">
      <button type="button" onClick={() => open({ type: 'exam', exam: e })} className="press flex min-w-0 flex-1 items-center gap-3 text-left">
        <SubjectBadge color={e.subjectColor} name={e.subjectName ?? e.title} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body leading-snug font-semibold">{e.title}</span>
          <span className="mt-1 flex flex-wrap gap-1.5">
            <MetaChip icon={CalendarDays} tone={soon ? 'warn' : 'neutral'}>
              {relativeDay(e.date, today)}
            </MetaChip>
            {e.time && <MetaChip icon={Clock}>{formatTime(e.time)}</MetaChip>}
            <MetaChip>{EXAM_KIND_LABEL[e.kind]}</MetaChip>
            {e.topicsTotal > 0 && (
              <MetaChip icon={ListChecks}>
                {e.topicsDone}/{e.topicsTotal}
              </MetaChip>
            )}
          </span>
        </span>
      </button>
      <button
        type="button"
        aria-label={`Study status: ${STUDY_LABEL[e.studyStatus]}. Change to ${STUDY_LABEL[next]}`}
        onClick={() => cycle.fire()}
        disabled={cycle.pending}
        className="press inline-flex min-h-11 shrink-0 items-center"
      >
        <Pill tone={STUDY_TONE[e.studyStatus]}>{STUDY_LABEL[e.studyStatus]}</Pill>
      </button>
    </div>
  )
}
