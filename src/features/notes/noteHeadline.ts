import type { Note } from '@/types/models'

/** Title and one-line preview for list rows; untitled notes use their first line. */
export function noteHeadline(n: Pick<Note, 'title' | 'body'>): { title: string; preview: string } {
  const lines = n.body.split('\n').map((l) => l.trim()).filter(Boolean)
  if (n.title) return { title: n.title, preview: lines.join(' ') }
  return { title: lines[0] ?? '', preview: lines.slice(1).join(' ') }
}
