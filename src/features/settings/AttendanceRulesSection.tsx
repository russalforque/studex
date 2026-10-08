import { useRepos, useSettings } from '@/app/contexts'
import { Segmented } from '@/components/ui/choice'
import { Section } from '@/components/ui/display'
import { useAction } from '@/hooks/useAction'
import type { AttendanceRules } from '@/types/models'

/** Schools count late and excused classes differently; this matches Studex to the student's school. */
export function AttendanceRulesSection() {
  const repos = useRepos()
  const { attendanceRules: rules } = useSettings()
  const save = useAction((next: AttendanceRules) => repos.settings.setAttendanceRules(next), ['settings', 'attendance'])
  const update = (patch: Partial<AttendanceRules>) => save.fire({ ...rules, ...patch })

  return (
    <Section title="Attendance">
      <div className="card flex flex-col gap-4 rounded-[28px] p-4">
        <div>
          <p className="mb-2 pl-1 text-subhead font-semibold">A late arrival counts as</p>
          <Segmented
            label="A late arrival counts as"
            value={rules.late}
            onChange={(late) => update({ late })}
            options={[
              { value: 'present', label: 'Present' },
              { value: 'half', label: 'Half' },
              { value: 'absent', label: 'Absent' },
            ]}
          />
        </div>
        <div>
          <p className="mb-2 pl-1 text-subhead font-semibold">Excused absences</p>
          <Segmented
            label="Excused absences"
            value={rules.excused}
            onChange={(excused) => update({ excused })}
            options={[
              { value: 'skip', label: "Don't count" },
              { value: 'present', label: 'Count as present' },
            ]}
          />
        </div>
        <p className="pl-1 text-footnote text-ink-3">Check your student handbook. The required percentage is set per subject.</p>
      </div>
    </Section>
  )
}
