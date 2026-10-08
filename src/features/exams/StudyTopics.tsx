import { useState } from 'react'
import { Check, ChevronDown, ChevronUp, Plus, X } from 'lucide-react'
import { useRepos } from '@/app/contexts'
import { IconButton } from '@/components/ui/Button'
import { ProgressBar } from '@/components/ui/display'
import { TextInput } from '@/components/ui/fields'
import { useExamTopics } from '@/hooks/data'
import { useAction } from '@/hooks/useAction'
import { cn } from '@/utils/cn'

interface Item {
  key: string
  title: string
  done: boolean
}

/**
 * A short checklist of what to review. For a saved exam every change is stored at once;
 * for a new exam the topics are kept here and saved together with it.
 * Tap a topic's name to rename it; the arrows move it up or down.
 */
export function StudyTopics({
  examId,
  pending = [],
  onPendingChange = () => undefined,
}: {
  examId?: string
  pending?: string[]
  onPendingChange?: (topics: string[]) => void
}) {
  const repos = useRepos()
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<{ key: string; title: string } | null>(null)
  const { data: saved = [] } = useExamTopics(examId ?? '')
  const areas = ['topics', 'exams'] as const
  const add = useAction((title: string) => repos.exams.addTopic(examId ?? '', title), [...areas])
  const toggle = useAction((id: string, done: boolean) => repos.exams.setTopicDone(id, done), [...areas])
  const remove = useAction((id: string) => repos.exams.removeTopic(id), [...areas])
  const rename = useAction((id: string, title: string) => repos.exams.renameTopic(id, title), [...areas])
  const move = useAction((id: string, dir: -1 | 1) => repos.exams.moveTopic(id, dir), [...areas])

  const items: Item[] = examId
    ? saved.map((t) => ({ key: t.id, title: t.title, done: t.done }))
    : pending.map((title, i) => ({ key: String(i), title, done: false }))
  const done = items.filter((i) => i.done).length

  const submit = () => {
    const title = draft.trim()
    if (!title) return
    if (examId) add.fire(title)
    else onPendingChange([...pending, title])
    setDraft('')
  }

  const commitRename = () => {
    if (!editing) return
    const title = editing.title.trim()
    const i = items.findIndex((t) => t.key === editing.key)
    setEditing(null)
    if (!title || i < 0 || title === items[i]!.title) return
    if (examId) rename.fire(editing.key, title)
    else onPendingChange(pending.map((t, j) => (j === i ? title : t)))
  }

  const reorder = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= items.length) return
    if (examId) return move.fire(items[i]!.key, dir)
    const next = [...pending]
    ;[next[i], next[j]] = [next[j]!, next[i]!]
    onPendingChange(next)
  }

  return (
    <div className="flex flex-col gap-2.5">
      {examId && items.length > 0 && (
        <div className="flex items-center gap-3 px-1">
          <ProgressBar value={(done / items.length) * 100} tone={done === items.length ? 'ok' : 'accent'} label={`${done} of ${items.length} topics reviewed`} />
          <span className="tabular shrink-0 text-footnote font-semibold text-ink-2">
            {done} / {items.length}
          </span>
        </div>
      )}
      {items.length > 0 && (
        <ul className="flex flex-col">
          {items.map((t, i) => (
            <li key={t.key} className="flex min-h-12 items-center gap-1 border-b border-line last:border-b-0">
              {examId ? (
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={t.done}
                  aria-label={t.title}
                  onClick={() => toggle.fire(t.key, !t.done)}
                  className="flex size-11 shrink-0 items-center justify-center"
                >
                  <span
                    className={cn(
                      'flex size-6 items-center justify-center rounded-full border-[1.5px]',
                      t.done ? 'border-accent bg-accent text-accent-ink' : 'border-surface-3 bg-surface-2',
                    )}
                  >
                    {t.done && <Check className="size-3.5" strokeWidth={3} aria-hidden />}
                  </span>
                </button>
              ) : (
                <span className="flex size-11 shrink-0 items-center justify-center" aria-hidden>
                  <span className="size-6 rounded-full border-[1.5px] border-surface-3 bg-surface-2" />
                </span>
              )}
              {editing?.key === t.key ? (
                <TextInput
                  aria-label={`Rename ${t.title}`}
                  autoFocus
                  enterKeyHint="done"
                  maxLength={120}
                  className="min-h-10 py-0"
                  value={editing.title}
                  onChange={(e) => setEditing({ key: t.key, title: e.target.value })}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      commitRename()
                    } else if (e.key === 'Escape') setEditing(null)
                  }}
                />
              ) : (
                <button
                  type="button"
                  aria-label={`Rename ${t.title}`}
                  onClick={() => setEditing({ key: t.key, title: t.title })}
                  className={cn('min-h-11 min-w-0 flex-1 text-left text-body', t.done && 'text-ink-3 line-through')}
                >
                  {t.title}
                </button>
              )}
              {items.length > 1 && (
                <span className="flex shrink-0">
                  <IconButton label={`Move ${t.title} up`} tone="plain" className="size-9" disabled={i === 0} onClick={() => reorder(i, -1)}>
                    <ChevronUp className="size-4" />
                  </IconButton>
                  <IconButton
                    label={`Move ${t.title} down`}
                    tone="plain"
                    className="size-9"
                    disabled={i === items.length - 1}
                    onClick={() => reorder(i, 1)}
                  >
                    <ChevronDown className="size-4" />
                  </IconButton>
                </span>
              )}
              <IconButton
                label={`Remove ${t.title}`}
                tone="plain"
                className="size-9"
                onClick={() => (examId ? remove.fire(t.key) : onPendingChange(pending.filter((_, j) => j !== i)))}
              >
                <X className="size-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <TextInput
          aria-label="New topic"
          placeholder={items.length ? 'Add another topic' : 'e.g. OSI Model'}
          enterKeyHint="done"
          value={draft}
          maxLength={120}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submit()
            }
          }}
        />
        <IconButton label="Add topic" className="size-13" onClick={submit} disabled={!draft.trim() || add.pending}>
          <Plus className="size-5" />
        </IconButton>
      </div>
    </div>
  )
}
