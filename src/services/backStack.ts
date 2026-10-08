/**
 * Android's hardware back button (and Escape on the web) should close the top-most
 * sheet before it navigates. Sheets register a handler while open; the most recent wins.
 */
type Handler = () => void

const stack: Handler[] = []

export function pushBackHandler(handler: Handler): () => void {
  stack.push(handler)
  return () => {
    const i = stack.lastIndexOf(handler)
    if (i >= 0) stack.splice(i, 1)
  }
}

/** Returns true when an open sheet consumed the back press. */
export function handleBack(): boolean {
  const top = stack[stack.length - 1]
  if (!top) return false
  top()
  return true
}
