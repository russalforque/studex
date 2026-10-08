import { GraduationCap } from 'lucide-react'
import { Page } from '@/components/layout/Page'
import { EmptyState, ErrorNotice, List, Loading, MetaChip, Row, SubjectBadge } from '@/components/ui/display'
import { attendanceStanding, attendanceStats } from '@/domain/attendance'
import { formatPercent, gradeSummary, targetStatus } from '@/domain/grades'
import { useSheets } from '@/features/sheets/SheetsContext'
import { useCurrentSemester, useSubjects, useTermAttendance, useTermGradeCategories, useTermGrades } from '@/hooks/data'
import { useSettings } from '@/app/contexts'

/** "How am I doing?" across the current term: estimated grades and attendance per subject. */
export function AcademicsPage() {
  const open = useSheets()
  const { data: semester } = useCurrentSemester()
  const { data: subjects, isPending, error, refetch } = useSubjects()
  const { data: grades = [] } = useTermGrades()
  const { data: categories = [] } = useTermGradeCategories()
  const { data: attendance = [] } = useTermAttendance()
  const { attendanceRules } = useSettings()

  const rows = (subjects ?? []).map((s) => {
    const estimate = gradeSummary(
      grades.filter((g) => g.subjectId === s.id),
      categories.filter((c) => c.subjectId === s.id),
      null,
    ).estimate
    const stats = attendanceStats(
      attendance.filter((a) => a.subjectId === s.id),
      attendanceRules,
    )
    return { subject: s, estimate, rate: stats.rate, standing: attendanceStanding(stats, s.attendanceRequired) }
  })
  const estimates = rows.map((r) => r.estimate).filter((e): e is number => e !== null)
  const overall = estimates.length ? Math.round((estimates.reduce((a, b) => a + b, 0) / estimates.length) * 10) / 10 : null
  const overallRate = attendanceStats(attendance, attendanceRules).rate
  const atRisk = rows.filter((r) => r.standing.kind === 'below' || r.standing.kind === 'close')

  return (
    <Page title="Grades & attendance" back>
      {semester && (
        <div className="mb-4">
          <MetaChip>
            {semester.name}
            {semester.academicYear && ` · ${semester.academicYear}`}
          </MetaChip>
        </div>
      )}
      {isPending ? (
        <Loading />
      ) : error ? (
        <ErrorNotice message="Your subjects couldn't be loaded." onRetry={() => void refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          tone="sky"
          title="No subjects yet"
          message="Add your subjects, then record scores and attendance from each subject's page."
          action={{ label: 'Add subject', onClick: () => open({ type: 'subject' }) }}
        />
      ) : (
        <>
          <dl className="mb-2 grid grid-cols-2 gap-2.5">
            <div className="card rounded-[26px] p-4">
              <dt className="text-footnote font-medium text-ink-2">Average estimate</dt>
              <dd className="tabular mt-1 text-title-1 font-bold">{overall === null ? '–' : formatPercent(overall)}</dd>
            </div>
            <div className="card rounded-[26px] p-4">
              <dt className="text-footnote font-medium text-ink-2">Attendance</dt>
              <dd className="tabular mt-1 text-title-1 font-bold">{overallRate === null ? '–' : `${overallRate}%`}</dd>
            </div>
          </dl>
          <p className="mb-6 px-1 text-footnote text-ink-3">
            Estimates come from the scores you entered and may differ from your school's official grades.
          </p>
          {atRisk.length > 0 && (
            <p role="note" className="mb-4 rounded-2xl bg-warn-soft px-4 py-3 text-subhead text-warn">
              Keep an eye on attendance in {atRisk.map((r) => r.subject.name).join(', ')}: it is near or below what your school requires.
            </p>
          )}
          <List>
            {rows.map(({ subject: s, estimate, rate }) => {
              const status = estimate !== null && s.targetGrade ? targetStatus(estimate, s.targetGrade) : null
              return (
                <Row
                  key={s.id}
                  to={`/subjects/${s.id}`}
                  leading={<SubjectBadge color={s.color} name={s.name} />}
                  title={s.name}
                  subtitle={[
                    rate === null ? 'No attendance yet' : `${rate}% attendance${s.attendanceRequired ? ` (needs ${formatPercent(s.attendanceRequired)})` : ''}`,
                    s.targetGrade ? `Target ${formatPercent(s.targetGrade)}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  trailing={
                    <span className="flex flex-col items-end">
                      <span className="tabular text-callout font-bold">{estimate === null ? '–' : formatPercent(estimate)}</span>
                      {status && (
                        <span className={status === 'below' ? 'text-caption font-medium text-warn' : 'text-caption font-medium text-ok'}>
                          {status === 'met' ? 'On target' : status === 'close' ? 'Close' : 'Below target'}
                        </span>
                      )}
                    </span>
                  }
                  chevron
                />
              )
            })}
          </List>
        </>
      )}
    </Page>
  )
}
