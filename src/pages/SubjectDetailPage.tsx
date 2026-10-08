import { useParams } from 'react-router'
import { CalendarDays, Clock, Hash, MapPin, Pencil, Plus, UserRound, BookOpen } from 'lucide-react'
import { useClock } from '@/app/contexts'
import { Page } from '@/components/layout/Page'
import { IconButton } from '@/components/ui/Button'
import { HeroCard } from '@/components/ui/HeroCard'
import { ErrorNotice, List, Loading, MetaChip, Pill, Row, Section, SectionButton } from '@/components/ui/display'
import { subjectStyle } from '@/features/subjects/colors'
import { EXAM_KIND_LABEL, STUDY_LABEL, STUDY_TONE } from '@/features/exams/labels'
import { useSheets } from '@/features/sheets/SheetsContext'
import { TaskRow } from '@/features/tasks/TaskRow'
import { useSubject, useSubjectExams, useSubjectSlots, useSubjectTasks } from '@/hooks/data'
import { formatTimeRange, relativeDay, WEEKDAYS_LONG, WEEKDAYS_SHORT } from '@/utils/dates'

export function SubjectDetailPage() {
  const { id = '' } = useParams()
  const open = useSheets()
  const { today } = useClock()
  const { data: subject, isPending, error } = useSubject(id)
  const { data: slots = [] } = useSubjectSlots(id)
  const { data: tasks = [] } = useSubjectTasks(id)
  const { data: exams = [] } = useSubjectExams(id)

  if (isPending) {
    return (
      <Page back="/subjects">
        <Loading />
      </Page>
    )
  }
  if (error || !subject) {
    return (
      <Page back="/subjects">
        <ErrorNotice message="This subject could not be found. It may have been deleted." />
      </Page>
    )
  }

  const openTasks = tasks.filter((t) => t.status !== 'completed')
  const upcomingExams = exams.filter((e) => e.date >= today && e.studyStatus !== 'completed')
  const add = <Plus className="size-3.5" aria-hidden />

  return (
    <Page
      back="/subjects"
      title="Subject"
      actions={
        <IconButton label="Edit subject" onClick={() => open({ type: 'subject', subject })}>
          <Pencil className="size-4.5" />
        </IconButton>
      }
    >
      <HeroCard subject style={subjectStyle(subject.color)} art={BookOpen}>
        {subject.code && (
          <span className="inline-flex items-center gap-1 rounded-full bg-surface/70 px-2.5 py-1 text-[12px] font-semibold">
            <Hash className="size-3" aria-hidden />
            {subject.code}
          </span>
        )}
        <h1 className="mt-2 text-[24px] leading-tight font-bold tracking-tight">{subject.name}</h1>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {subject.instructor && (
            <MetaChip icon={UserRound} tone="onColor">
              {subject.instructor}
            </MetaChip>
          )}
          {subject.room && (
            <MetaChip icon={MapPin} tone="onColor">
              {subject.room}
            </MetaChip>
          )}
          {slots.length > 0 && (
            <MetaChip icon={CalendarDays} tone="onColor">
              {slots.length} class{slots.length === 1 ? '' : 'es'} a week
            </MetaChip>
          )}
        </div>
      </HeroCard>

      <Section title="Class times" action={<SectionButton icon={add} onClick={() => open({ type: 'class', subjectId: subject.id })}>Add</SectionButton>}>
        {slots.length === 0 ? (
          <p className="px-1 py-2 text-[14px] text-ink-3">No class times yet.</p>
        ) : (
          <List>
            {slots.map((s) => (
              <Row
                key={s.id}
                onClick={() => open({ type: 'class', slot: s })}
                leading={
                  <span className="flex size-11 items-center justify-center rounded-full bg-surface-2 text-[12px] font-bold text-ink-2">
                    {WEEKDAYS_SHORT[s.dayOfWeek]}
                  </span>
                }
                title={WEEKDAYS_LONG[s.dayOfWeek]}
                subtitle={
                  <span className="flex gap-1.5 pt-0.5">
                    <MetaChip icon={Clock}>{formatTimeRange(s.startTime, s.endTime)}</MetaChip>
                    {s.displayRoom && <MetaChip icon={MapPin}>{s.displayRoom}</MetaChip>}
                  </span>
                }
                chevron
              />
            ))}
          </List>
        )}
      </Section>

      <Section title="Tasks" action={<SectionButton icon={add} onClick={() => open({ type: 'task', subjectId: subject.id })}>Add</SectionButton>}>
        {openTasks.length === 0 ? (
          <p className="px-1 py-2 text-[14px] text-ink-3">No open tasks.</p>
        ) : (
          <List>
            {openTasks.map((t) => (
              <TaskRow key={t.id} task={t} showSubject={false} />
            ))}
          </List>
        )}
      </Section>

      <Section
        title="Exams & quizzes"
        action={<SectionButton icon={add} onClick={() => open({ type: 'exam', subjectId: subject.id })}>Add</SectionButton>}
      >
        {upcomingExams.length === 0 ? (
          <p className="px-1 py-2 text-[14px] text-ink-3">Nothing scheduled.</p>
        ) : (
          <List>
            {upcomingExams.map((e) => (
              <Row
                key={e.id}
                onClick={() => open({ type: 'exam', exam: e })}
                title={e.title}
                subtitle={`${EXAM_KIND_LABEL[e.kind]} · ${relativeDay(e.date, today)}`}
                trailing={<Pill tone={STUDY_TONE[e.studyStatus]}>{STUDY_LABEL[e.studyStatus]}</Pill>}
              />
            ))}
          </List>
        )}
      </Section>

      {subject.notes && (
        <Section title="Notes">
          <p className="card rounded-[26px] px-4 py-3.5 text-[15px] whitespace-pre-wrap text-ink-2">{subject.notes}</p>
        </Section>
      )}
    </Page>
  )
}
