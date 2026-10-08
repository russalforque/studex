import {
  Bus,
  Circle,
  Clapperboard,
  Coffee,
  FolderKanban,
  Gift,
  GraduationCap,
  Heart,
  House,
  type LucideIcon,
  PencilRuler,
  Printer,
  Shirt,
  ShoppingBag,
  Smartphone,
  User,
  Utensils,
  Ellipsis,
} from 'lucide-react'
import { cn } from '@/utils/cn'

/** Icon keys stored in expense_categories.icon. Custom categories pick from this list. */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  food: Utensils,
  transport: Bus,
  school: GraduationCap,
  printing: Printer,
  projects: FolderKanban,
  supplies: PencilRuler,
  mobile: Smartphone,
  entertainment: Clapperboard,
  personal: User,
  other: Ellipsis,
  coffee: Coffee,
  shopping: ShoppingBag,
  clothes: Shirt,
  home: House,
  gift: Gift,
  health: Heart,
}

/** Each built-in category gets a pastel so lists are easy to scan. */
const TONES: Record<string, string> = {
  food: 'bg-peach text-peach-ink',
  transport: 'bg-sky text-sky-ink',
  school: 'bg-lilac text-lilac-ink',
  printing: 'bg-surface-2 text-ink-2',
  projects: 'bg-mint text-mint-ink',
  supplies: 'bg-sun text-sun-ink',
  mobile: 'bg-sky text-sky-ink',
  entertainment: 'bg-pink text-pink-ink',
  personal: 'bg-lilac text-lilac-ink',
  coffee: 'bg-peach text-peach-ink',
  shopping: 'bg-pink text-pink-ink',
  clothes: 'bg-lime text-lime-ink',
  home: 'bg-mint text-mint-ink',
  gift: 'bg-pink text-pink-ink',
  health: 'bg-mint text-mint-ink',
}

export function CategoryIcon({ icon, selected, className }: { icon: string; selected?: boolean; className?: string }) {
  const Icon = CATEGORY_ICONS[icon] ?? Circle
  return (
    <span
      className={cn(
        'flex size-11 shrink-0 items-center justify-center rounded-full transition-colors',
        selected ? 'bg-accent text-accent-ink' : (TONES[icon] ?? 'bg-surface-2 text-ink-2'),
        className,
      )}
    >
      <Icon className="size-[18px]" aria-hidden />
    </span>
  )
}
