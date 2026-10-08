import { BellOff } from 'lucide-react'
import { useRepos, useSettings } from '@/app/contexts'
import { Chips, SwitchRow } from '@/components/ui/choice'
import { IconCircle, Section } from '@/components/ui/display'
import { useToast } from '@/components/ui/Toast'
import { useAction } from '@/hooks/useAction'
import { remindersSupported, requestReminderPermission } from '@/services/reminders'
import { DAY_BEFORE, LEAD_OPTIONS, type ReminderPrefs } from '@/types/models'

const CLASS_LEADS = [10, 15, 30, 60]

const leadLabel = (m: number) => (m === 0 ? 'At the time' : m === DAY_BEFORE ? '1 day before' : m === 60 ? '1 hour before' : `${m} min before`)
const LEAD_CHOICES = LEAD_OPTIONS.map((m) => ({ value: m as number, label: leadLabel(m) }))

/**
 * Opt-in and quiet by design. Permission is asked for only when the student turns reminders on
 * (or starts a focus timer), never at first launch; with it denied, the app works the same.
 */
export function RemindersSection() {
  const repos = useRepos()
  const toast = useToast()
  const { reminders: prefs } = useSettings()
  const save = useAction((next: ReminderPrefs) => repos.settings.setReminderPrefs(next), ['settings'])
  const update = (patch: Partial<ReminderPrefs>) => save.fire({ ...prefs, ...patch })

  const toggleAll = async (on: boolean) => {
    if (on && !(await requestReminderPermission())) {
      toast("Notifications are turned off for Studex. Allow them in your phone's settings to get reminders.", 'error')
      return
    }
    update({ enabled: on })
  }

  if (!remindersSupported) {
    return (
      <Section title="Reminders">
        <div className="card flex items-center gap-3 rounded-[28px] p-4">
          <IconCircle icon={BellOff} tone="sun" />
          <p className="text-subhead text-ink-2">Reminders are available in the Studex app on your phone or tablet.</p>
        </div>
      </Section>
    )
  }

  const leadHint = (m: number, what: string) =>
    m === DAY_BEFORE ? `One message at 7 PM the evening before.` : `Before each ${what} with a time; untimed ones get a morning reminder.`

  return (
    <Section title="Reminders">
      <div className="card rounded-[28px] px-4 py-2">
        <SwitchRow
          label="Reminders"
          hint="Work offline, even when Studex is closed."
          checked={prefs.enabled}
          disabled={save.pending}
          onChange={(on) => void toggleAll(on)}
        />
        {prefs.enabled && (
          <div className="border-t border-line">
            <SwitchRow label="Tasks" hint={leadHint(prefs.taskLeadMinutes, 'task')} checked={prefs.tasks} onChange={(tasks) => update({ tasks })} />
            {prefs.tasks && (
              <div className="pb-3">
                <Chips label="When to remind about tasks" value={prefs.taskLeadMinutes} onChange={(taskLeadMinutes) => update({ taskLeadMinutes })} options={LEAD_CHOICES} />
              </div>
            )}
            <SwitchRow
              label="Exams and quizzes"
              hint={prefs.examLeadMinutes === DAY_BEFORE ? 'The evening before, with your study progress.' : leadHint(prefs.examLeadMinutes, 'exam')}
              checked={prefs.exams}
              onChange={(exams) => update({ exams })}
            />
            {prefs.exams && (
              <div className="pb-3">
                <Chips label="When to remind about exams" value={prefs.examLeadMinutes} onChange={(examLeadMinutes) => update({ examLeadMinutes })} options={LEAD_CHOICES} />
              </div>
            )}
            <SwitchRow label="Before each class" checked={prefs.classes} onChange={(classes) => update({ classes })} />
            {prefs.classes && (
              <div className="pb-3">
                <Chips
                  label="How early"
                  value={prefs.classLeadMinutes}
                  onChange={(classLeadMinutes) => update({ classLeadMinutes })}
                  options={CLASS_LEADS.map((m) => ({ value: m, label: m === 60 ? '1 hour' : `${m} min` }))}
                />
              </div>
            )}
            <SwitchRow label="Planned school expenses" hint="The morning they're due." checked={prefs.planned} onChange={(planned) => update({ planned })} />
            <SwitchRow label="Log today's spending" hint="A short nudge at 8:30 PM." checked={prefs.budget} onChange={(budget) => update({ budget })} />
          </div>
        )}
        <div className={prefs.enabled ? 'border-t border-line' : undefined}>
          <SwitchRow label="Focus timer" hint="When a session or break ends, even with the phone locked." checked={prefs.focus} onChange={(focus) => update({ focus })} />
        </div>
      </div>
    </Section>
  )
}
