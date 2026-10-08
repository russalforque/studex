import { useState } from 'react'
import { BadgeCheck, BookOpenText, CalendarPlus, Compass, GraduationCap, Layers, LifeBuoy, Plus } from 'lucide-react'
import { useRepos, useSettings } from '@/app/contexts'
import { Page } from '@/components/layout/Page'
import { Avatar } from '@/components/ui/Avatar'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import { DayPicker } from '@/components/ui/choice'
import { IconCircle, List, Row, Section, SectionButton } from '@/components/ui/display'
import { Select } from '@/components/ui/fields'
import { useTour } from '@/features/guide/TourContext'
import { AppearanceSection } from '@/features/settings/AppearanceSection'
import { AppLockSection } from '@/features/settings/AppLockSection'
import { AttendanceRulesSection } from '@/features/settings/AttendanceRulesSection'
import { DataSection } from '@/features/settings/DataSection'
import { RemindersSection } from '@/features/settings/RemindersSection'
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
  const tour = useTour()

  const setCurrency = useAction((currency: string) => repos.settings.setCurrency(currency), ['settings', ...MONEY], {
    success: 'Currency updated',
  })
  const setDays = useAction((days: number[]) => repos.settings.setSpendingDays(days), ['settings', 'budget'])

  const knownCurrency = CURRENCIES.some((c) => c.code === settings.currency)
  const profileLine = [settings.course, settings.yearLevel, settings.schoolName].filter(Boolean).join(' · ')

  return (
    <Page title="Settings" back>
      <Section title="Profile">
        <List>
          <Row
            onClick={() => setOpen({ kind: 'profile' })}
            leading={<Avatar name={settings.studentName} photo={settings.avatar} />}
            title={settings.studentName}
            subtitle={profileLine || 'Add your school and course'}
            chevron
          />
        </List>
      </Section>

      <AppearanceSection />

      <Section title="Term">
        <List>
          <Row
            onClick={() => setOpen({ kind: 'term', startNew: false })}
            leading={<IconCircle icon={GraduationCap} tone="sky" />}
            title={semester?.name ?? 'No term set'}
            subtitle={semester?.academicYear ? `Current · ${semester.academicYear}` : 'Current term'}
            chevron
          />
          <Row to="/terms" leading={<IconCircle icon={Layers} tone="lilac" />} title="All terms" subtitle="Previous and archived terms" chevron />
          <Row
            onClick={() => setOpen({ kind: 'term', startNew: true })}
            leading={<IconCircle icon={CalendarPlus} tone="mint" />}
            title="Start a new term"
            subtitle="Subjects and classes start fresh; nothing is deleted"
          />
        </List>
      </Section>

      <AttendanceRulesSection />

      <RemindersSection />

      <Section title="Money">
        <div className="card rounded-[28px] p-4">
          <label htmlFor="currency" className="mb-1.5 block pl-1 text-subhead font-semibold">
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
          <p className="mt-1.5 pl-1 text-footnote text-ink-3">Changing currency only changes the symbol. Amounts are not converted.</p>

          <p className="mt-6 mb-2 pl-1 text-subhead font-semibold">Spending days</p>
          <DayPicker
            label="Spending days"
            value={settings.spendingDays}
            onChange={(days) => {
              if (days.length > 0) setDays.fire(days)
            }}
          />
          <p className="mt-2 pl-1 text-footnote text-ink-3">
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
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setOpen({ kind: 'category', category: c })}
              className="card press flex min-h-14 items-center gap-2.5 rounded-full py-1.5 pr-3 pl-1.5 text-left active:bg-surface-2"
            >
              <CategoryIcon icon={c.icon} />
              <span className="min-w-0 truncate text-subhead font-semibold">{c.name}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Help & guide">
        <List>
          <Row
            onClick={() => tour.start()}
            leading={<IconCircle icon={Compass} tone="lilac" />}
            title="Take the app tour"
            subtitle="A one-minute walk through the main screens"
          />
          <Row to="/help" leading={<IconCircle icon={BookOpenText} tone="sky" />} title="How to use Studex" subtitle="The basics in three steps" chevron />
          <Row
            to="/help?section=guides"
            leading={<IconCircle icon={LifeBuoy} tone="mint" />}
            title="Feature guides"
            subtitle="Short how-tos for each part of the app"
            chevron
          />
        </List>
      </Section>

      <Section title="License & purchase">
        <List>
          <Row to="/license" leading={<IconCircle icon={BadgeCheck} tone="mint" />} title="Studex Lifetime" subtitle="Activation, devices, restore and support" chevron />
        </List>
      </Section>

      <AppLockSection />

      <DataSection />

      {open?.kind === 'profile' && <ProfileSheet onClose={() => setOpen(null)} />}
      {open?.kind === 'term' && <TermSheet semester={semester} startNew={open.startNew} onClose={() => setOpen(null)} />}
      {open?.kind === 'category' && <CategorySheet category={open.category} onClose={() => setOpen(null)} />}
    </Page>
  )
}
