import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft, Search, X } from 'lucide-react'
import { useClock, useRepos } from '@/app/contexts'
import { IconButton } from '@/components/ui/Button'
import { List, Loading, MetaChip, Row, Section, SubjectBadge } from '@/components/ui/display'
import { EXAM_KIND_LABEL } from '@/features/exams/labels'
import { noteHeadline } from '@/features/notes/noteHeadline'
import { useSheets } from '@/features/sheets/SheetsContext'
import { FileList, FileRow } from '@/features/files/FileRow'
import { FileViewer } from '@/features/files/FileViewer'
import { useFiles, useSearch } from '@/hooks/data'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/repositories/errors'
import { relativeDay } from '@/utils/dates'

/** Finds subjects, tasks, exams and notes on this device as you type. */
export function SearchPage() {
  const navigate = useNavigate()
  const repos = useRepos()
  const open = useSheets()
  const toast = useToast()
  const { today } = useClock()
  const [query, setQuery] = useState('')
  const [viewing, setViewing] = useState<string | null>(null)
  const { data, isFetching } = useSearch(query)
  const active = query.trim().length >= 2
  const results = active ? data : undefined
  const { data: fileHits = [] } = useFiles({ search: query.trim(), limit: 15 }, active)
  const files = active ? fileHits : []
  const count = results ? results.subjects.length + results.tasks.length + results.exams.length + results.notes.length + files.length : 0

  // Search rows carry only what they show; load the full record before opening its sheet.
  const openRecord = async (kind: 'task' | 'exam' | 'note', id: string) => {
    try {
      if (kind === 'task') open({ type: 'task', task: await repos.tasks.get(id) })
      else if (kind === 'exam') open({ type: 'exam', exam: await repos.exams.get(id) })
      else open({ type: 'note', note: await repos.notes.get(id) })
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  return (
    <div className="mx-auto min-h-dvh w-full max-w-2xl">
      <header className="pt-safe sticky top-0 z-30 bg-bg/90 backdrop-blur-md">
        <div className="px-safe flex min-h-18 items-center gap-2 py-2">
          <IconButton label="Back" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}>
            <ArrowLeft className="size-5" strokeWidth={2} />
          </IconButton>
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-4 size-4.5 -translate-y-1/2 text-ink-3" aria-hidden />
            <input
              type="search"
              autoFocus
              enterKeyHint="search"
              aria-label="Search Studex"
              placeholder="Subjects, tasks, exams, notes, files"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="min-h-12 w-full rounded-full border border-line bg-surface pr-11 pl-11 text-callout outline-none placeholder:text-ink-3 focus:border-ink [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setQuery('')}
                className="absolute top-1/2 right-1.5 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-ink-2"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>
      </header>
      <main className="px-safe pt-2" style={{ paddingBottom: 'calc(var(--nav-h) + var(--sab) + 32px)' }}>
        {!active ? (
          <p className="px-1 pt-6 text-center text-subhead text-ink-3">Type at least two letters.</p>
        ) : !results ? (
          isFetching ? <Loading /> : null
        ) : count === 0 ? (
          <p className="px-1 pt-6 text-center text-subhead text-ink-3">Nothing found for “{query.trim()}”.</p>
        ) : (
          <>
            <Group title="Subjects" show={results.subjects.length > 0}>
              {results.subjects.map((s) => (
                <Row
                  key={s.id}
                  to={`/subjects/${s.id}`}
                  leading={<SubjectBadge color={s.color} name={s.name} />}
                  title={s.name}
                  subtitle={[s.code, s.instructor].filter(Boolean).join(' · ') || undefined}
                  chevron
                />
              ))}
            </Group>
            <Group title="Tasks" show={results.tasks.length > 0}>
              {results.tasks.map((t) => (
                <Row
                  key={t.id}
                  onClick={() => void openRecord('task', t.id)}
                  leading={<SubjectBadge color={t.subjectColor} name={t.subjectName ?? t.title} />}
                  title={t.title}
                  subtitle={
                    <span className="flex gap-1.5 pt-0.5">
                      {t.status === 'completed' ? <MetaChip>Done</MetaChip> : t.dueDate && <MetaChip>{relativeDay(t.dueDate, today)}</MetaChip>}
                      {t.subjectName && <span className="truncate">{t.subjectName}</span>}
                    </span>
                  }
                />
              ))}
            </Group>
            <Group title="Exams & quizzes" show={results.exams.length > 0}>
              {results.exams.map((e) => (
                <Row
                  key={e.id}
                  onClick={() => void openRecord('exam', e.id)}
                  leading={<SubjectBadge color={e.subjectColor} name={e.subjectName ?? e.title} />}
                  title={e.title}
                  subtitle={`${EXAM_KIND_LABEL[e.kind]} · ${relativeDay(e.date, today)}`}
                />
              ))}
            </Group>
            <Group title="Notes" show={results.notes.length > 0}>
              {results.notes.map((n) => {
                const h = noteHeadline(n)
                return (
                  <Row
                    key={n.id}
                    onClick={() => void openRecord('note', n.id)}
                    title={h.title}
                    subtitle={[n.subjectName, h.preview].filter(Boolean).join(' · ') || undefined}
                  />
                )
              })}
            </Group>
            {files.length > 0 && (
              <Section title="Files">
                <FileList>
                  {files.map((f) => (
                    <FileRow key={f.id} file={f} onOpen={() => setViewing(f.id)} />
                  ))}
                </FileList>
              </Section>
            )}
          </>
        )}
      </main>
      {viewing && <FileViewer fileId={viewing} onClose={() => setViewing(null)} />}
    </div>
  )
}

function Group({ title, show, children }: { title: string; show: boolean; children: ReactNode }) {
  if (!show) return null
  return (
    <Section title={title}>
      <List>{children}</List>
    </Section>
  )
}
