import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { Library, Pencil, Plus } from 'lucide-react'
import { useSettings } from '@/app/contexts'
import { Page } from '@/components/layout/Page'
import { IconButton } from '@/components/ui/Button'
import { EmptyState, ErrorNotice, List, Loading, MetaChip, Row, SubjectBadge } from '@/components/ui/display'
import { useSheets } from '@/features/sheets/SheetsContext'
import { SubjectDetail } from '@/features/subjects/SubjectDetail'
import { useSemester, useTermSlots, useTermSubjects } from '@/hooks/data'
import { useMediaQuery, WIDE } from '@/hooks/useMediaQuery'
import { cn } from '@/utils/cn'
import { formatTime, weekdaySummary } from '@/utils/dates'
import type { ClassSlotView } from '@/types/models'

/** "MWF · 1:00 PM" when all class times start together, otherwise "MWF". */
function scheduleSummary(slots: ClassSlotView[]): string | null {
  if (slots.length === 0) return null
  const days = weekdaySummary(slots.map((s) => s.dayOfWeek))
  const starts = new Set(slots.map((s) => s.startTime))
  return starts.size === 1 ? `${days} · ${formatTime(slots[0]!.startTime)}` : days
}

/**
 * The current term's subjects, or another term's with `?term=`. On wide screens the
 * selected subject opens beside the list instead of on its own page.
 */
export function SubjectsPage() {
  const open = useSheets()
  const [params] = useSearchParams()
  const { currentSemesterId } = useSettings()
  const termId = params.get('term') ?? currentSemesterId ?? ''
  const isCurrent = termId === currentSemesterId
  const { data: semester } = useSemester(termId)
  const { data: subjects, isPending, error, refetch } = useTermSubjects(termId)
  const { data: slots = [] } = useTermSlots(termId)
  const wide = useMediaQuery(WIDE)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = subjects?.find((s) => s.id === selectedId) ?? (wide ? subjects?.[0] : undefined)

  const list =
    isPending ? (
      <Loading />
    ) : error ? (
      <ErrorNotice message="Subjects couldn't be loaded." onRetry={() => void refetch()} />
    ) : subjects.length === 0 ? (
      <EmptyState
        icon={Library}
        tone="sky"
        title={isCurrent ? 'No subjects yet' : 'No subjects in this term'}
        message={isCurrent ? "Add the subjects you're taking this term to connect classes, tasks and exams." : undefined}
        action={isCurrent ? { label: 'Add subject', onClick: () => open({ type: 'subject' }) } : undefined}
      />
    ) : (
      <List>
        {subjects.map((s) => {
          const summary = scheduleSummary(slots.filter((x) => x.subjectId === s.id))
          return (
            <Row
              key={s.id}
              to={wide ? undefined : `/subjects/${s.id}`}
              onClick={wide ? () => setSelectedId(s.id) : undefined}
              className={cn(wide && selected?.id === s.id && 'border-ink')}
              leading={<SubjectBadge color={s.color} name={s.name} />}
              title={s.name}
              subtitle={[s.instructor, summary].filter(Boolean).join(' · ') || 'No class times yet'}
              chevron={!wide}
            />
          )
        })}
      </List>
    )

  return (
    <Page
      title="Subjects"
      back
      wide={wide}
      actions={
        <>
          {wide && selected && (
            <IconButton label="Edit subject" onClick={() => open({ type: 'subject', subject: selected })}>
              <Pencil className="size-4.5" />
            </IconButton>
          )}
          {isCurrent && (
            <IconButton label="Add subject" tone="accent" data-tour="subjects-add" onClick={() => open({ type: 'subject' })}>
              <Plus className="size-5" />
            </IconButton>
          )}
        </>
      }
    >
      {semester && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <MetaChip>
            {semester.name}
            {semester.academicYear && ` · ${semester.academicYear}`}
          </MetaChip>
          {!isCurrent && <MetaChip tone="lilac">Past term</MetaChip>}
        </div>
      )}
      {wide ? (
        <div className="grid grid-cols-[minmax(280px,360px)_1fr] items-start gap-8">
          <div className="sticky top-24">{list}</div>
          <div className="min-w-0">{selected ? <SubjectDetail key={selected.id} subject={selected} /> : null}</div>
        </div>
      ) : (
        list
      )}
    </Page>
  )
}
