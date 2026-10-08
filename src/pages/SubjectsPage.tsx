import { Library, Plus } from 'lucide-react'
import { Page } from '@/components/layout/Page'
import { IconButton } from '@/components/ui/Button'
import { EmptyState, ErrorNotice, List, Loading, MetaChip, Row, SubjectBadge } from '@/components/ui/display'
import { useSheets } from '@/features/sheets/SheetsContext'
import { useCurrentSemester, useSlots, useSubjects } from '@/hooks/data'
import { formatTime, weekdaySummary } from '@/utils/dates'
import type { ClassSlotView } from '@/types/models'

/** "MWF · 1:00 PM" when all class times start together, otherwise "MWF". */
function scheduleSummary(slots: ClassSlotView[]): string | null {
  if (slots.length === 0) return null
  const days = weekdaySummary(slots.map((s) => s.dayOfWeek))
  const starts = new Set(slots.map((s) => s.startTime))
  return starts.size === 1 ? `${days} · ${formatTime(slots[0]!.startTime)}` : days
}

export function SubjectsPage() {
  const open = useSheets()
  const { data: semester } = useCurrentSemester()
  const { data: subjects, isPending, error, refetch } = useSubjects()
  const { data: slots = [] } = useSlots()

  return (
    <Page
      title="Subjects"
      back="/more"
      actions={
        <IconButton label="Add subject" tone="accent" onClick={() => open({ type: 'subject' })}>
          <Plus className="size-5" />
        </IconButton>
      }
    >
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
        <ErrorNotice message="Subjects couldn't be loaded." onRetry={() => void refetch()} />
      ) : subjects.length === 0 ? (
        <EmptyState
          icon={Library}
          tone="sky"
          title="No subjects yet"
          message="Add the subjects you're taking this term to connect classes, tasks and exams."
          action={{ label: 'Add subject', onClick: () => open({ type: 'subject' }) }}
        />
      ) : (
        <List>
          {subjects.map((s) => {
            const summary = scheduleSummary(slots.filter((x) => x.subjectId === s.id))
            return (
              <Row
                key={s.id}
                to={`/subjects/${s.id}`}
                leading={<SubjectBadge color={s.color} name={s.name} />}
                title={s.name}
                subtitle={[s.instructor, summary].filter(Boolean).join(' · ') || 'No class times yet'}
                chevron
              />
            )
          })}
        </List>
      )}
    </Page>
  )
}
