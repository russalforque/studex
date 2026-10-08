import type { CSSProperties } from 'react'

/** Identification colours: dots, tinted badges and subject hero cards. */
export const SUBJECT_COLORS = [
  '#4F46E5', // indigo
  '#0E7490', // teal
  '#15803D', // green
  '#B45309', // amber
  '#BE123C', // rose
  '#7C3AED', // violet
  '#0369A1', // blue
  '#57534E', // stone
] as const

export function nextSubjectColor(used: string[]): string {
  const free = SUBJECT_COLORS.find((c) => !used.includes(c))
  return free ?? SUBJECT_COLORS[used.length % SUBJECT_COLORS.length]!
}

/** CSS variables for the `.subject-tint` / `.subject-hero` classes; `--c-a` is a hex-alpha fallback. */
export function subjectStyle(color: string | null | undefined): CSSProperties {
  const c = color ?? '#8e8e97'
  return { '--c': c, '--c-a': `${c}26` } as CSSProperties
}
