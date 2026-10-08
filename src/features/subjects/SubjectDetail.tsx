import { useState } from 'react'
import { Link } from 'react-router'
import { BookOpen, CalendarDays, Clock, Hash, MapPin, Pin, Plus, Scale, Target, UserRound } from 'lucide-react'
import { useClock, useSettings } from '@/app/contexts'
import { HeroCard } from '@/components/ui/HeroCard'
import { List, MetaChip, Pill, ProgressBar, Row, Section, SectionButton } from '@/components/ui/display'
import { ATTENDANCE_LABEL, attendanceNote, attendanceStanding, attendanceStats, type Standing } from '@/domain/attendance'
import { formatPercent, gradeSummary, itemPercent, targetStatus } from '@/domain/grades'
import { EXAM_KIND_LABEL, STUDY_LABEL, STUDY_TONE } from '@/features/exams/labels'
import { AddFileFlow } from '@/features/files/AddFileFlow'
import { FileList, FileRow } from '@/features/files/FileRow'
import { FileViewer } from '@/features/files/FileViewer'
import { noteHeadline } from '@/features/notes/noteHeadline'
import { useSheets } from '@/features/sheets/SheetsContext'
import { subjectStyle } from '@/features/subjects/colors'
import { TaskRow } from '@/features/tasks/TaskRow'
import {
  useGradeCategories,
  useNotes,
  useSubjectAttendance,
  useSubjectExams,
  useSubjectFiles,
  useSubjectGrades,
  useSubjectSlots,
  useSubjectTasks,
} from '@/hooks/data'
import type { AttendanceStatus, GradeItem, Subject } from '@/types/models'
import { cn } from '@/utils/cn'
import { formatShortDate, formatTime, formatTimeRange, relativeDay, WEEKDAYS_LONG, WEEKDAYS_SHORT } from '@/utils/dates'

const STATUS_TONE: Record<AttendanceStatus, 'ok' | 'warn' | 'danger' | 'neutral'> = {
  present: 'ok',
  late: 'warn',
  absent: 'danger',
  excused: 'neutral',
}

/** Everything about one subject. Used by the subject page and by the tablet split view. */
export function SubjectDetail({ subject }: { subject: Subject }) {
  const open = useSheets()
  const { today } = useClock()
  const { currentSemesterId } = useSettings()
  const { data: slots = [] } = useSubjectSlots(subject.id)
  const { data: tasks = [] } = useSubjectTasks(subject.id)
  const { data: exams = [] } = useSubjectExams(subject.id)
  const pastTerm = subject.semesterId !== currentSemesterId

  const openTasks = tasks.filter((t) => t.status !== 'completed')
  const upcomingExams = exams.filter((e) => e.date >= today && e.studyStatus !== 'completed')
  const add = <Plus className="size-3.5" aria-hidden />

  return (
    <>
      <HeroCard subject style={subjectStyle(subject.color)} art={BookOpen}>
        {subject.code && (
          <span className="inline-flex items-center gap-1 rounded-full bg-surface/70 px-2.5 py-1 text-caption font-semibold">
            <Hash className="size-3" aria-hidden />
            {subject.code}
          </span>
        )}
        <h1 className="mt-2 text-title-1 leading-tight font-bold">{subject.name}</h1>
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

      {pastTerm && <p className="mt-4 px-1 text-footnote text-ink-3">This subject is from another term.</p>}

      <GradesSection subject={subject} />
      <AttendanceSection subject={subject} />

      <Section
        title="Class times"
        action={
          !pastTerm && (
            <SectionButton icon={add} onClick={() => open({ type: 'class', subjectId: subject.id })}>
              Add
            </SectionButton>
          )
        }
      >
        {slots.length === 0 ? (
          <p className="px-1 py-2 text-subhead text-ink-3">No class times yet.</p>
        ) : (
          <List>
            {slots.map((s) => (
              <Row
                key={s.id}
                onClick={() => open({ type: 'class', slot: s })}
                leading={
                  <span className="flex size-11 items-center justify-center rounded-full bg-surface-2 text-caption font-bold text-ink-2">
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
          <p className="px-1 py-2 text-subhead text-ink-3">No open tasks.</p>
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
          <p className="px-1 py-2 text-subhead text-ink-3">Nothing scheduled.</p>
        ) : (
          <List>
            {upcomingExams.map((e) => (
              <Row
                key={e.id}
                onClick={() => open({ type: 'exam', exam: e })}
                title={e.title}
                subtitle={[
                  EXAM_KIND_LABEL[e.kind],
                  relativeDay(e.date, today),
                  e.topicsTotal > 0 ? `${e.topicsDone}/${e.topicsTotal} topics` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                trailing={<Pill tone={STUDY_TONE[e.studyStatus]}>{STUDY_LABEL[e.studyStatus]}</Pill>}
              />
            ))}
          </List>
        )}
      </Section>

      <FilesSection subjectId={subject.id} />
      <NotesSection subjectId={subject.id} />

      {subject.notes && (
        <Section title="About">
          <p className="card rounded-[26px] px-4 py-3.5 text-body whitespace-pre-wrap text-ink-2">{subject.notes}</p>
        </Section>
      )}
    </>
  )
}

function GradesSection({ subject }: { subject: Subject }) {
  const open = useSheets()
  const { today } = useClock()
  const { data: grades = [] } = useSubjectGrades(subject.id)
  const { data: categories = [] } = useGradeCategories(subject.id)
  const [showAll, setShowAll] = useState(false)
  const target = subject.targetGrade
  const summary = gradeSummary(grades, categories, target)
  const estimate = summary.estimate
  const status = estimate !== null && target ? targetStatus(estimate, target) : null
  const shown = showAll ? grades : grades.slice(0, 4)
  const pendingWord = `${summary.pending} ungraded item${summary.pending === 1 ? '' : 's'}`

  return (
    <Section
      title="Grades"
      action={
        <SectionButton icon={<Plus className="size-3.5" aria-hidden />} onClick={() => open({ type: 'grade', subjectId: subject.id })}>
          Add
        </SectionButton>
      }
    >
      {grades.length > 0 && estimate === null ? (
        <div className="card rounded-[26px] px-4 py-3.5">
          <p className="text-subhead text-ink-2">Nothing graded yet. Add a score when you get one back to see your estimate.</p>
          <GradeItems grades={shown} subjectId={subject.id} today={today} />
        </div>
      ) : grades.length === 0 ? (
        <div className="card rounded-[26px] px-4 py-3.5">
          <p className="text-subhead text-ink-2">Add quiz, exam and project scores to see an estimate of where you stand.</p>
          {!target && (
            <button type="button" onClick={() => open({ type: 'subject', subject })} className="press mt-2 inline-flex min-h-10 items-center gap-1.5 text-subhead font-semibold">
              <Target className="size-4" aria-hidden />
              Set a target grade
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="card rounded-[26px] p-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-footnote font-medium text-ink-2">Current estimate</p>
                <p className="tabular mt-0.5 text-large-title leading-none font-bold">{formatPercent(estimate!)}</p>
              </div>
              {target ? (
                <button type="button" onClick={() => open({ type: 'subject', subject })} className="press text-right">
                  <p className="text-footnote font-medium text-ink-2">Target</p>
                  <p className="tabular mt-0.5 text-title-3 leading-none font-bold">{formatPercent(target)}</p>
                </button>
              ) : (
                <button type="button" onClick={() => open({ type: 'subject', subject })} className="press inline-flex min-h-10 items-center gap-1.5 text-footnote font-semibold text-ink-2">
                  <Target className="size-4" aria-hidden />
                  Set target
                </button>
              )}
            </div>
            <div className="mt-3.5">
              <ProgressBar
                value={estimate!}
                tone={status === 'below' ? 'warn' : status === 'met' ? 'ok' : 'accent'}
                label={`Estimated grade ${formatPercent(estimate!)}`}
              />
            </div>
            <p className="mt-2.5 text-footnote text-ink-2">
              {status === 'met'
                ? 'At or above your target.'
                : status === 'close'
                  ? `Close to your target: ${formatPercent(Math.round((target! - estimate!) * 10) / 10)} to go.`
                  : status === 'below'
                    ? `${formatPercent(Math.round((target! - estimate!) * 10) / 10)} below your target so far.`
                    : `Based on ${grades.length - summary.pending} graded item${grades.length - summary.pending === 1 ? '' : 's'}.`}
            </p>
            {summary.outlook && (
              <p className={cn('mt-2 rounded-2xl px-3 py-2 text-footnote', summary.outlook === 'out_of_reach' ? 'bg-warn-soft text-warn' : 'bg-surface-2 text-ink-2')}>
                {summary.outlook === 'reachable'
                  ? `To finish at ${formatPercent(target!)}, you need about ${formatPercent(summary.needed!)} on your ${pendingWord}.`
                  : summary.outlook === 'secured'
                    ? `You'd reach ${formatPercent(target!)} whatever you score on your ${pendingWord}.`
                    : `Even 100% on your ${pendingWord} wouldn't reach ${formatPercent(target!)}. It may be worth asking your instructor about extra work.`}
              </p>
            )}
            {categories.length > 0 && (
              <dl className="mt-3 flex flex-col gap-1 border-t border-line pt-3">
                {summary.categories.map((c) => (
                  <div key={c.id ?? 'other'} className="flex items-baseline justify-between gap-3 text-footnote">
                    <dt className="text-ink-2">
                      {c.name} <span className="text-ink-3">· {formatPercent(c.weight)}</span>
                    </dt>
                    <dd className="tabular font-semibold">{c.percent === null ? '–' : formatPercent(c.percent)}</dd>
                  </div>
                ))}
              </dl>
            )}
            {summary.ignored > 0 && (
              <p className="mt-2 text-caption text-warn">
                {summary.ignored} item{summary.ignored === 1 ? " isn't" : "s aren't"} in a category, and the categories already add up to 100%, so{' '}
                {summary.ignored === 1 ? "it doesn't" : "they don't"} count.
              </p>
            )}
            <p className="mt-2 text-caption text-ink-3">An estimate from the scores you entered. Your school's official grade may be calculated differently.</p>
            <button
              type="button"
              onClick={() => open({ type: 'gradeCategories', subjectId: subject.id })}
              className="press mt-1 inline-flex min-h-10 items-center gap-1.5 text-footnote font-semibold text-ink-2"
            >
              <Scale className="size-4" aria-hidden />
              {categories.length > 0 ? 'Grading breakdown' : 'Add a grading breakdown'}
            </button>
          </div>
          <GradeItems grades={shown} subjectId={subject.id} today={today} />
          {grades.length > 4 && (
            <button type="button" onClick={() => setShowAll((s) => !s)} className="press mt-2 min-h-10 w-full text-subhead font-semibold text-ink-2">
              {showAll ? 'Show less' : `Show all ${grades.length}`}
            </button>
          )}
        </>
      )}
    </Section>
  )
}

function GradeItems({ grades, subjectId, today }: { grades: GradeItem[]; subjectId: string; today: string }) {
  const open = useSheets()
  if (grades.length === 0) return null
  return (
    <List className="mt-2.5">
      {grades.map((g) => (
        <Row
          key={g.id}
          onClick={() => open({ type: 'grade', subjectId, grade: g })}
          title={g.title}
          subtitle={[
            g.score === null ? `Out of ${g.maxScore}` : `${g.score} / ${g.maxScore}`,
            g.weight !== 1 ? `×${g.weight}` : null,
            g.gradedOn ? formatShortDate(g.gradedOn, today) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
          trailing={
            g.score === null ? (
              <Pill>Not graded</Pill>
            ) : (
              <span className="tabular text-body font-semibold">{formatPercent(itemPercent({ score: g.score, maxScore: g.maxScore }))}</span>
            )
          }
        />
      ))}
    </List>
  )
}

function AttendanceSection({ subject }: { subject: Subject }) {
  const subjectId = subject.id
  const open = useSheets()
  const { today } = useClock()
  const { attendanceRules } = useSettings()
  const { data: records = [] } = useSubjectAttendance(subjectId)
  const [showAll, setShowAll] = useState(false)
  const stats = attendanceStats(records, attendanceRules)
  const standing = attendanceStanding(stats, subject.attendanceRequired)
  const note = attendanceNote(records)
  const shown = showAll ? records : records.slice(0, 3)
  const required = subject.attendanceRequired

  return (
    <Section
      title="Attendance"
      action={
        <SectionButton icon={<Plus className="size-3.5" aria-hidden />} onClick={() => open({ type: 'attendance', subjectId })}>
          Mark
        </SectionButton>
      }
    >
      {records.length === 0 ? (
        <p className="card rounded-[26px] px-4 py-3.5 text-subhead text-ink-2">
          After each class, Home asks how it went. One tap keeps your attendance here.
        </p>
      ) : (
        <>
          <div className="card rounded-[26px] p-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-footnote font-medium text-ink-2">Attendance</p>
                <p className="tabular mt-0.5 text-large-title leading-none font-bold">{stats.rate === null ? '–' : `${stats.rate}%`}</p>
              </div>
              <button type="button" onClick={() => open({ type: 'subject', subject })} className="press text-right">
                <p className="text-footnote font-medium text-ink-2">Required</p>
                <p className="tabular mt-0.5 text-title-3 leading-none font-bold">{required ? formatPercent(required) : <span className="text-subhead text-ink-3">Set</span>}</p>
              </button>
            </div>
            {required !== null && stats.exactRate !== null && (
              <div className="mt-3.5">
                <ProgressBar
                  value={stats.exactRate}
                  tone={standing.kind === 'below' ? 'danger' : standing.kind === 'close' ? 'warn' : 'ok'}
                  label={`Attendance ${stats.rate}% of ${formatPercent(required)} required`}
                />
              </div>
            )}
            <dl className="mt-3.5 grid grid-cols-4 border-t border-line pt-3 text-center">
              {[
                ['Classes', stats.total],
                ['Attended', stats.present + stats.late],
                ['Absent', stats.absent],
                ['Late', stats.late],
              ].map(([label, value]) => (
                <div key={label}>
                  <dd className="tabular text-headline leading-tight font-bold">{value}</dd>
                  <dt className="mt-0.5 text-caption text-ink-2">{label}</dt>
                </div>
              ))}
            </dl>
          </div>
          <StandingNote standing={standing} required={required} />
          {note && standing.kind !== 'below' && <p className="mt-2.5 px-1 text-footnote text-ink-2">{note}</p>}
          <List className="mt-2.5">
            {shown.map((r) => (
              <Row
                key={r.id}
                onClick={() => open({ type: 'attendance', subjectId, record: r })}
                title={relativeDay(r.date, today)}
                subtitle={r.startTime ? formatTime(r.startTime) : undefined}
                trailing={<Pill tone={STATUS_TONE[r.status]}>{ATTENDANCE_LABEL[r.status]}</Pill>}
              />
            ))}
          </List>
          {records.length > 3 && (
            <button type="button" onClick={() => setShowAll((s) => !s)} className="press mt-2 min-h-10 w-full text-subhead font-semibold text-ink-2">
              {showAll ? 'Show less' : `Show all ${records.length}`}
            </button>
          )}
        </>
      )}
    </Section>
  )
}

/** A friendly heads-up against the required percentage; nothing when there's no requirement. */
function StandingNote({ standing, required }: { standing: Standing; required: number | null }) {
  if (standing.kind === 'none' || required === null) return null
  const req = formatPercent(required)
  const text =
    standing.kind === 'ok'
      ? `On track. You could miss ${standing.canMiss} more classes in a row and stay at ${req} or above.`
      : standing.kind === 'close'
        ? standing.canMiss === 0
          ? `Right at the limit. One more absence would take you below ${req}.`
          : `Getting close. One more absence is fine, a second would take you below ${req}.`
        : standing.toRecover === null
          ? `Below the required ${req}.`
          : `Below the required ${req}. Attending the next ${standing.toRecover} class${standing.toRecover === 1 ? '' : 'es'} would bring you back up.`
  return (
    <p
      className={cn(
        'mt-2.5 rounded-2xl px-4 py-3 text-subhead',
        standing.kind === 'below' ? 'bg-danger-soft text-danger' : standing.kind === 'close' ? 'bg-warn-soft text-warn' : 'card text-ink-2',
      )}
    >
      {text}
    </p>
  )
}

function NotesSection({ subjectId }: { subjectId: string }) {
  const open = useSheets()
  const { data: notes = [] } = useNotes(subjectId)
  return (
    <Section
      title="Notes"
      action={
        <SectionButton icon={<Plus className="size-3.5" aria-hidden />} onClick={() => open({ type: 'note', subjectId })}>
          Add
        </SectionButton>
      }
    >
      {notes.length === 0 ? (
        <p className="px-1 py-2 text-subhead text-ink-3">No notes yet.</p>
      ) : (
        <List>
          {notes.map((n) => {
            const h = noteHeadline(n)
            return (
              <Row
                key={n.id}
                onClick={() => open({ type: 'note', note: n })}
                title={
                  <span className="flex items-center gap-1.5">
                    {n.pinned && <Pin className="size-3.5 shrink-0 text-ink-3" aria-label="Pinned" />}
                    <span className="truncate">{h.title}</span>
                  </span>
                }
                subtitle={h.preview || undefined}
              />
            )
          })}
        </List>
      )}
    </Section>
  )
}

const FILES_SHOWN = 4

/** Study materials for this subject: the latest few, with the rest one tap away in Files. */
function FilesSection({ subjectId }: { subjectId: string }) {
  const { data: files = [] } = useSubjectFiles(subjectId)
  const [adding, setAdding] = useState(false)
  const [viewing, setViewing] = useState<string | null>(null)
  return (
    <Section
      title="Files"
      action={
        <SectionButton icon={<Plus className="size-3.5" aria-hidden />} onClick={() => setAdding(true)}>
          Add
        </SectionButton>
      }
    >
      {files.length === 0 ? (
        <p className="px-1 py-2 text-subhead text-ink-3">Photos of the board, handouts and reviewers for this subject.</p>
      ) : (
        <>
          <FileList>
            {files.slice(0, FILES_SHOWN).map((f) => (
              <FileRow key={f.id} file={f} showSubject={false} onOpen={() => setViewing(f.id)} />
            ))}
          </FileList>
          {files.length > FILES_SHOWN && (
            <Link to={`/files?subject=${subjectId}`} className="press mt-1 flex min-h-11 items-center justify-center text-subhead font-semibold text-ink-2">
              See all {files.length} files
            </Link>
          )}
        </>
      )}
      {adding && <AddFileFlow subjectId={subjectId} onClose={() => setAdding(false)} />}
      {viewing && <FileViewer fileId={viewing} onClose={() => setViewing(null)} />}
    </Section>
  )
}
