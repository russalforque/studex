import type { ReactNode } from 'react'

/**
 * Tablet landscape: primary content on the left, supporting content on the right.
 * Everywhere else the two simply stack, exactly as a single-column page. With nothing to show
 * on the right (e.g. no item to preview yet), the primary content keeps the full width.
 */
export function Columns({ wide, primary, secondary }: { wide: boolean; primary: ReactNode; secondary: ReactNode }) {
  if (!wide || secondary == null) {
    return (
      <>
        {primary}
        {secondary}
      </>
    )
  }
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-8">
      <div className="min-w-0">{primary}</div>
      <div className="min-w-0">{secondary}</div>
    </div>
  )
}
