import { useClock, useSettings } from '@/app/contexts'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import { Row } from '@/components/ui/display'
import { useSheets } from '@/features/sheets/SheetsContext'
import type { Expense } from '@/types/models'
import { relativeDay } from '@/utils/dates'
import { formatMoney } from '@/utils/money'

export function ExpenseRow({ expense, showDate = true }: { expense: Expense; showDate?: boolean }) {
  const open = useSheets()
  const { currency } = useSettings()
  const { today } = useClock()
  return (
    <Row
      onClick={() => open({ type: 'expense', expense })}
      leading={<CategoryIcon icon={expense.categoryIcon} />}
      title={expense.description || expense.categoryName}
      subtitle={[expense.description ? expense.categoryName : null, showDate ? relativeDay(expense.spentOn, today) : null]
        .filter(Boolean)
        .join(' · ')}
      trailing={<span className="tabular text-[16px] font-medium">−{formatMoney(expense.amount, currency)}</span>}
    />
  )
}
