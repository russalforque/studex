import { useState } from 'react'
import { CalendarPlus, GraduationCap, Plus, ShieldCheck } from 'lucide-react'
import { useRepos, useSettings } from '@/app/contexts'
import { Page } from '@/components/layout/Page'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import { DayPicker } from '@/components/ui/choice'
import { IconCircle, List, Row, Section, SectionButton } from '@/components/ui/display'
import { Select } from '@/components/ui/fields'
import { CategorySheet, ProfileSheet, TermSheet } from '@/features/settings/settingsSheets'
import { useCategories, useCurrentSemester } from '@/hooks/data'
import { MONEY } from '@/hooks/queryKeys'
import { useAction } from '@/hooks/useAction'
import type { ExpenseCategory } from '@/types/models'
import { CURRENCIES } from '@/utils/money'

type Open = { kind: 'profile' } | { kind: 'term'; startNew: boolean } | { kind: 'category'; category?: ExpenseCategory } | null

export function SettingsPage() {
  const repos = useRepos()
  const settings = useSettings()
  const { data: semester = null } = useCurrentSemester()
  const { data: categories = [] } = useCategories()
  const [open, setOpen] = useState<Open>(null)

  const setCurrency = useAction(
    (currency: string) =>
      repos.settings.updateProfile({ studentName: settings.studentName, schoolName: settings.schoolName, currency }),
    ['settings', ...MONEY],
    { success: 'Currency updated' },
  )
  const setDays = useAction((days: number[]) => repos.settings.setSpendingDays(days), ['settings', 'budget'])

  const knownCurrency = CURRENCIES.some((c) => c.code === settings.currency)
  const initial = settings.studentName.trim().slice(0, 1).toUpperCase() || '·'

  return (
    <Page title="Settings" back="/more">
      <Section title="Profile">
        <List>
          <Row
            onClick={() => setOpen({ kind: 'profile' })}
            leading={
              <span className="flex size-11 items-center justify-center rounded-full bg-linear-to-br from-lilac to-pink text-[16px] font-bold text-lilac-ink">
                {initial}
              </span>
            }
            title={settings.studentName}
            subtitle={settings.schoolName ?? 'Add your school'}
            chevron
          />
        </List>
      </Section>

      <Section title="Term">
        <List>
          <Row
            onClick={() => setOpen({ kind: 'term', startNew: false })}
            leading={<IconCircle icon={GraduationCap} tone="sky" />}
            title={semester?.name ?? 'No term set'}
            subtitle={semester?.academicYear ?? undefined}
            chevron
          />
          <Row
            onClick={() => setOpen({ kind: 'term', startNew: true })}
            leading={<IconCircle icon={CalendarPlus} tone="mint" />}
            title="Start a new term"
            subtitle="Subjects and classes start fresh"
          />
        </List>
      </Section>

      <Section title="Money">
        <div className="card rounded-[28px] p-4">
          <label htmlFor="currency" className="mb-1.5 block pl-1 text-[14px] font-semibold">
            Currency
          </label>
          <Select id="currency" value={settings.currency} disabled={setCurrency.pending} onChange={(e) => setCurrency.fire(e.target.value)}>
            {!knownCurrency && <option value={settings.currency}>{settings.currency}</option>}
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} · {c.name}
              </option>
            ))}
          </Select>
          <p className="mt-1.5 pl-1 text-[13px] text-ink-3">Changing currency only changes the symbol. Amounts are not converted.</p>

          <p className="mt-6 mb-2 pl-1 text-[14px] font-semibold">Spending days</p>
          <DayPicker
            label="Spending days"
            value={settings.spendingDays}
            onChange={(days) => {
              if (days.length > 0) setDays.fire(days)
            }}
          />
          <p className="mt-2 pl-1 text-[13px] text-ink-3">
            “Safe to spend” divides your remaining money across these days. Choose only school days if you spend mostly on campus.
          </p>
        </div>
      </Section>

      <Section
        title="Expense categories"
        action={
          <SectionButton icon={<Plus className="size-3.5" aria-hidden />} onClick={() => setOpen({ kind: 'category' })}>
            Add
          </SectionButton>
        }
      >
        <div className="grid grid-cols-2 gap-2.5">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setOpen({ kind: 'category', category: c })}
              className="card press flex min-h-14 items-center gap-2.5 rounded-full py-1.5 pr-3 pl-1.5 text-left active:bg-surface-2"
            >
              <CategoryIcon icon={c.icon} />
              <span className="min-w-0 truncate text-[14px] font-semibold">{c.name}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Your data">
        <div className="card flex gap-3 rounded-[28px] p-4">
          <IconCircle icon={ShieldCheck} tone="mint" />
          <div>
            <p className="text-[14px] text-ink-2">
              Everything you add is stored only on this device. Studex works fully offline and has no account. Backup and export are
              coming in a future update.
            </p>
            <p className="mt-3 text-[13px] text-ink-3">Studex {__APP_VERSION__}</p>
          </div>
        </div>
      </Section>

      {open?.kind === 'profile' && <ProfileSheet onClose={() => setOpen(null)} />}
      {open?.kind === 'term' && <TermSheet semester={semester} startNew={open.startNew} onClose={() => setOpen(null)} />}
      {open?.kind === 'category' && <CategorySheet category={open.category} onClose={() => setOpen(null)} />}
    </Page>
  )
}
