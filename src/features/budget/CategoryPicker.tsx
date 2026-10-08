import { CategoryIcon } from '@/components/ui/CategoryIcon'
import { useCategories } from '@/hooks/data'
import { cn } from '@/utils/cn'

/** The grid of expense categories used by every money form. */
export function CategoryPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { data: categories = [] } = useCategories()
  return (
    <div role="radiogroup" aria-label="Category" className="grid grid-cols-4 gap-x-1 gap-y-2">
      {categories.map((c) => {
        const active = c.id === value
        return (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(c.id)}
            className="press flex flex-col items-center gap-1 rounded-xl py-1.5"
          >
            <CategoryIcon icon={c.icon} selected={active} className="size-11" />
            <span className={cn('line-clamp-2 text-center text-caption leading-tight', active ? 'font-semibold text-ink' : 'text-ink-2')}>{c.name}</span>
          </button>
        )
      })}
    </div>
  )
}
