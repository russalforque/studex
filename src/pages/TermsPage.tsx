import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Archive, ArchiveRestore, CalendarPlus, GraduationCap, Library, Pencil, RefreshCw } from 'lucide-react'
import { useRepos, useSettings } from '@/app/contexts'
import { Page } from '@/components/layout/Page'
import { Button } from '@/components/ui/Button'
import { ErrorNotice, IconCircle, List, Loading, Pill, Row, Section } from '@/components/ui/display'
import { Sheet } from '@/components/ui/Sheet'
import { TermSheet } from '@/features/settings/settingsSheets'
import { useSemesters } from '@/hooks/data'
import { useAction } from '@/hooks/useAction'
import type { SemesterSummary } from '@/types/models'

const TERM_AREAS = ['settings', 'semesters', 'subjects', 'slots', 'grades', 'attendance'] as const

/** Every term the student has had. Earlier terms stay intact and can be opened, made current or archived. */
export function TermsPage() {
  const { currentSemesterId } = useSettings()
  const { data: terms, isPending, error, refetch } = useSemesters()
  const [selected, setSelected] = useState<SemesterSummary | null>(null)
  const [editing, setEditing] = useState<{ term: SemesterSummary | null; startNew: boolean } | null>(null)

  const active = (terms ?? []).filter((t) => !t.archivedAt)
  const archived = (terms ?? []).filter((t) => t.archivedAt)
  const subtitle = (t: SemesterSummary) =>
    [t.academicYear, `${t.subjectCount} subject${t.subjectCount === 1 ? '' : 's'}`].filter(Boolean).join(' · ')

  const row = (t: SemesterSummary) => (
    <Row
      key={t.id}
      onClick={() => setSelected(t)}
      leading={<IconCircle icon={GraduationCap} tone={t.id === currentSemesterId ? 'mint' : 'sky'} />}
      title={t.name}
      subtitle={subtitle(t)}
      trailing={t.id === currentSemesterId ? <Pill tone="ok">Current</Pill> : undefined}
      chevron
    />
  )

  return (
    <Page title="Terms" back>
      {isPending ? (
        <Loading />
      ) : error ? (
        <ErrorNotice message="Your terms couldn't be loaded." onRetry={() => void refetch()} />
      ) : (
        <>
          <List>{active.map(row)}</List>
          <Button
            variant="secondary"
            block
            className="mt-4"
            icon={<CalendarPlus className="size-4.5" aria-hidden />}
            onClick={() => setEditing({ term: null, startNew: true })}
          >
            Start a new term
          </Button>
          {archived.length > 0 && (
            <Section title="Archived">
              <List>{archived.map(row)}</List>
            </Section>
          )}
          <p className="mt-6 px-1 text-footnote text-ink-3">
            Starting a new term never deletes anything. Subjects, grades and attendance stay with their term.
          </p>
        </>
      )}
      {selected && (
        <TermActions
          term={selected}
          isCurrent={selected.id === currentSemesterId}
          onEdit={() => {
            setEditing({ term: selected, startNew: false })
            setSelected(null)
          }}
          onClose={() => setSelected(null)}
        />
      )}
      {editing && <TermSheet semester={editing.term} startNew={editing.startNew} onClose={() => setEditing(null)} />}
    </Page>
  )
}

function TermActions({ term, isCurrent, onEdit, onClose }: { term: SemesterSummary; isCurrent: boolean; onEdit: () => void; onClose: () => void }) {
  const repos = useRepos()
  const navigate = useNavigate()
  const makeCurrent = useAction(() => repos.settings.switchSemester(term.id), [...TERM_AREAS], { success: `${term.name} is now current` })
  const archive = useAction(() => repos.settings.setSemesterArchived(term.id, !term.archivedAt), [...TERM_AREAS], {
    success: term.archivedAt ? 'Term restored' : 'Term archived',
  })

  return (
    <Sheet open onClose={onClose} title={term.name}>
      <List>
        <Row
          onClick={() => {
            onClose()
            navigate(isCurrent ? '/subjects' : `/subjects?term=${term.id}`)
          }}
          leading={<IconCircle icon={Library} tone="sky" />}
          title="View subjects"
          subtitle={`${term.subjectCount} subject${term.subjectCount === 1 ? '' : 's'}`}
          chevron
        />
        {!isCurrent && (
          <Row
            onClick={() => void makeCurrent.run().then(onClose, () => undefined)}
            leading={<IconCircle icon={RefreshCw} tone="mint" />}
            title="Make this the current term"
            subtitle="Home, Schedule and Subjects will show this term"
          />
        )}
        <Row onClick={onEdit} leading={<IconCircle icon={Pencil} tone="lilac" />} title="Rename" />
        {!isCurrent && (
          <Row
            onClick={() => void archive.run().then(onClose, () => undefined)}
            leading={<IconCircle icon={term.archivedAt ? ArchiveRestore : Archive} tone="peach" />}
            title={term.archivedAt ? 'Move out of archive' : 'Archive'}
            subtitle={term.archivedAt ? undefined : 'Tucks it away. Nothing is deleted.'}
          />
        )}
      </List>
    </Sheet>
  )
}
