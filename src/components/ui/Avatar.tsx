import { cn } from '@/utils/cn'

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '·'
  if (words.length === 1) return words[0]!.slice(0, 1).toUpperCase()
  return (words[0]![0]! + words[words.length - 1]![0]!).toUpperCase()
}

/** The student's photo, or their initials on a soft gradient when there is none. */
export function Avatar({ name, photo, size = 44, className }: { name: string; photo: string | null; size?: number; className?: string }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.36) }
  if (photo) {
    return <img src={photo} alt="" aria-hidden style={style} className={cn('shrink-0 rounded-full object-cover', className)} />
  }
  return (
    <span
      aria-hidden
      style={style}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-linear-to-br from-lilac to-pink font-bold text-lilac-ink',
        className,
      )}
    >
      {initials(name)}
    </span>
  )
}
