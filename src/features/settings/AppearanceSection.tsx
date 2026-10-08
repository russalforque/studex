import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react'
import { Segmented } from '@/components/ui/choice'
import { Section } from '@/components/ui/display'
import { useThemePreference, type ThemePreference } from '@/services/theme'

const OPTIONS: Array<{ value: ThemePreference; label: string; icon: LucideIcon }> = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
]

/** Light, dark, or follow the device. Applies instantly and is remembered on this device. */
export function AppearanceSection() {
  const [pref, setPref] = useThemePreference()
  return (
    <Section title="Appearance">
      <div className="card rounded-[28px] p-4">
        <Segmented
          label="Theme"
          value={pref}
          onChange={setPref}
          options={OPTIONS.map(({ value, label, icon: Icon }) => ({
            value,
            ariaLabel: label,
            label: (
              <span className="inline-flex items-center justify-center gap-1.5">
                <Icon className="size-4" aria-hidden />
                {label}
              </span>
            ),
          }))}
        />
        <p className="mt-2 pl-1 text-footnote text-ink-3">
          {pref === 'system' ? 'Matches your device’s light or dark setting.' : `Studex always uses the ${pref} theme.`}
        </p>
      </div>
    </Section>
  )
}
