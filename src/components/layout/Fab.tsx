import { Plus } from 'lucide-react'

/** The single floating Quick Add button. */
export function Fab({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="fab press fixed z-40 flex size-14 items-center justify-center rounded-full bg-accent text-accent-ink shadow-float"
      style={{ right: 'max(20px, calc(var(--sar) + 16px))', bottom: 'calc(var(--nav-h) + var(--sab) + 16px)' }}
    >
      <Plus className="size-6" strokeWidth={2.2} aria-hidden />
    </button>
  )
}
