import { useState } from 'react'
import { NotebookPen, Pin, Plus, Search } from 'lucide-react'
import { useClock } from '@/app/contexts'
import { Page } from '@/components/layout/Page'
import { IconButton } from '@/components/ui/Button'
import { EmptyState, ErrorNotice, List, Loading, Row, Section, SubjectDot } from '@/components/ui/display'
import { TextInput } from '@/components/ui/fields'
import { noteHeadline } from '@/features/notes/noteHeadline'
import { useSheets } from '@/features/sheets/SheetsContext'
import { useNotes } from '@/hooks/data'
import type { Note } from '@/types/models'
import { relativeDay, toISODate } from '@/utils/dates'
import { useMediaQuery, WIDE } from '@/hooks/useMediaQuery'
import { cn } from '@/utils/cn'

export function NotesPage() {
  const open = useSheets()
  const { data: notes, isPending, error, refetch } = useNotes()
  const [query, setQuery] = useState('')

  const q = query.trim().toLowerCase()
  // Tablet landscape: notes flow into two columns.
  const wide = useMediaQuery(WIDE)
  const visible = (notes ?? []).filter(
    (n) => !q || [n.title, n.body, n.subjectName].some((t) => t?.toLowerCase().includes(q)),
  )
  const pinned = visible.filter((n) => n.pinned)
  const recent = visible.filter((n) => !n.pinned)

  return (
    <Page
      title="Notes"
      back
      wide={wide}
      actions={
        <IconButton label="Add note" tone="accent" onClick={() => open({ type: 'note' })}>
          <Plus className="size-5" />
        </IconButton>
      }
    >
      {isPending ? (
        <Loading />
      ) : error ? (
        <ErrorNotice message="Notes couldn't be loaded." onRetry={() => void refetch()} />
      ) : notes.length === 0 ? (
        <EmptyState
          icon={NotebookPen}
          tone="lilac"
          title="No notes yet"
          message="Jot down reminders, tips from class or anything you want to find later."
          action={{ label: 'Add note', onClick: () => open({ type: 'note' }) }}
        />
      ) : (
        <>
          <div className={cn('relative mb-6', wide && 'max-w-md')}>
            <Search className="pointer-events-none absolute top-1/2 left-4 size-4.5 -translate-y-1/2 text-ink-3" aria-hidden />
            <TextInput
              type="search"
              aria-label="Search notes"
              placeholder="Search notes"
              className="pl-11"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {visible.length === 0 && <p className="px-1 text-subhead text-ink-3">No notes match “{query.trim()}”.</p>}
          {pinned.length > 0 && (
            <Section title="Pinned">
              <NoteList notes={pinned} wide={wide} />
            </Section>
          )}
          {recent.length > 0 && (
            <Section title={pinned.length ? 'Recently edited' : undefined}>
              <NoteList notes={recent} wide={wide} />
            </Section>
          )}
        </>
      )}
    </Page>
  )
}

function NoteList({ notes, wide }: { notes: Note[]; wide: boolean }) {
  const open = useSheets()
  const { today } = useClock()
  return (
    <List className={cn(wide && 'grid grid-cols-2')}>
      {notes.map((n) => {
        const h = noteHeadline(n)
        const edited = relativeDay(toISODate(new Date(n.updatedAt)), today)
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
            subtitle={
              <span className="flex items-center gap-1.5">
                {n.subjectName && (
                  <>
                    <SubjectDot color={n.subjectColor} className="size-2" />
                    <span className="max-w-32 shrink-0 truncate">{n.subjectName}</span>
                    <span aria-hidden>·</span>
                  </>
                )}
                <span className="shrink-0">{edited}</span>
                {h.preview && (
                  <>
                    <span aria-hidden>·</span>
                    <span className="truncate">{h.preview}</span>
                  </>
                )}
              </span>
            }
          />
        )
      })}
    </List>
  )
}
