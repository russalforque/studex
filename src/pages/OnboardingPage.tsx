import { useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CalendarDays, Check, ChevronRight, CircleCheck, GraduationCap, LoaderCircle, Wallet, type LucideIcon } from 'lucide-react'
import { useClock, useRepos } from '@/app/contexts'
import { Button, IconButton } from '@/components/ui/Button'
import { Field, Select, TextInput } from '@/components/ui/fields'
import { AllowanceFields } from '@/features/budget/AllowanceFields'
import { initialAllowanceValues, toPlanInput, type AllowanceFormValues } from '@/features/budget/allowanceForm'
import { FormError, FormStack } from '@/features/shared/formParts'
import { useForm } from '@/hooks/useForm'
import { errorMessage } from '@/repositories/errors'
import { CURRENCIES, guessCurrency } from '@/utils/money'
import { semesterSchema, settingsSchema, validate } from '@/validation/schemas'
import { cn } from '@/utils/cn'

function defaultAcademicYear(today: string): string {
  const y = Number(today.slice(0, 4))
  const m = Number(today.slice(5, 7))
  return m >= 6 ? `${y}–${y + 1}` : `${y - 1}–${y}`
}

const STEPS = ['You', 'Term', 'Allowance'] as const

export function OnboardingPage() {
  const repos = useRepos()
  const client = useQueryClient()
  const { today } = useClock()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const profile = useForm({ studentName: '', schoolName: '', currency: guessCurrency() })
  const term = useForm({ name: '', academicYear: defaultAcademicYear(today) })
  const allowance = useForm<AllowanceFormValues>(() => initialAllowanceValues(today))

  const nextFromProfile = () => {
    const res = validate(settingsSchema, profile.values)
    if (!res.ok) return profile.setErrors(res.errors)
    setStep(1)
  }

  const nextFromTerm = (skip: boolean) => {
    if (!skip) {
      const res = validate(semesterSchema, term.values)
      if (!res.ok) return term.setErrors(res.errors)
    }
    if (skip) term.setValues({ name: '', academicYear: '' })
    setStep(2)
  }

  const finish = async (skipAllowance: boolean) => {
    const p = validate(settingsSchema, profile.values)
    if (!p.ok) {
      setStep(0)
      return profile.setErrors(p.errors)
    }
    const t = term.values.name.trim()
      ? validate(semesterSchema, term.values)
      : ({ ok: true, data: { name: 'Current term', academicYear: term.values.academicYear.trim() || null } } as const)
    if (!t.ok) {
      setStep(1)
      return term.setErrors(t.errors)
    }
    let plan = null
    if (!skipAllowance) {
      const res = toPlanInput(allowance.values, today)
      if (!res.ok) return allowance.setErrors(res.errors)
      plan = res.data
    }

    setSaving(true)
    allowance.setFormError(null)
    try {
      await repos.db.transaction((tx) => repos.settings.completeOnboarding(tx, p.data, t.data))
      if (plan) {
        try {
          await repos.allowance.savePlan(plan, today)
        } catch (err) {
          // Setup itself succeeded; the allowance can be added from Budget.
          console.error('Saving allowance during onboarding failed', err)
        }
      }
      await client.invalidateQueries()
    } catch (err) {
      allowance.setFormError(errorMessage(err))
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
      {step === 0 && (
        <Step
          step={0}
          icon={GraduationCap}
          title={
            <>
              Thrilled to join your
              <br />
              <b className="font-bold">learning journey!</b>
            </>
          }
          lead="Your classes, tasks and allowance in one calm place. Everything stays on this phone."
          footer={<ContinueButton onClick={nextFromProfile} />}
        >
          <Field label="What should we call you?" error={profile.errors.studentName}>
            {(id, d) => (
              <TextInput
                id={id}
                aria-describedby={d}
                autoComplete="given-name"
                placeholder="Your name"
                value={profile.values.studentName}
                invalid={!!profile.errors.studentName}
                onChange={(e) => profile.set('studentName', e.target.value)}
              />
            )}
          </Field>
          <Field label="School or university" optional>
            {(id) => (
              <TextInput id={id} placeholder="e.g. University of the Philippines" value={profile.values.schoolName} onChange={(e) => profile.set('schoolName', e.target.value)} />
            )}
          </Field>
        </Step>
      )}

      {step === 1 && (
        <Step
          step={1}
          icon={CalendarDays}
          title={
            <>
              Set up this <b className="font-bold">term</b>
            </>
          }
          lead="Subjects and your class schedule belong to a term. You can start a new one anytime."
          onBack={() => setStep(0)}
          footer={
            <>
              <ContinueButton onClick={() => nextFromTerm(false)} />
              <Button variant="ghost" block onClick={() => nextFromTerm(true)}>
                Skip for now
              </Button>
            </>
          }
        >
          <Field label="Term or semester" error={term.errors.name}>
            {(id, d) => (
              <TextInput id={id} aria-describedby={d} placeholder="e.g. 1st Semester" value={term.values.name} invalid={!!term.errors.name} onChange={(e) => term.set('name', e.target.value)} />
            )}
          </Field>
          <Field label="Academic year" optional>
            {(id) => <TextInput id={id} value={term.values.academicYear} onChange={(e) => term.set('academicYear', e.target.value)} />}
          </Field>
        </Step>
      )}

      {step === 2 && (
        <Step
          step={2}
          icon={Wallet}
          title={
            <>
              Your <b className="font-bold">allowance</b>
            </>
          }
          lead="Studex uses it to show how much you can safely spend each day."
          onBack={() => setStep(1)}
          footer={
            <>
              <ContinueButton label="Finish" loading={saving} onClick={() => void finish(false)} />
              <Button variant="ghost" block disabled={saving} onClick={() => void finish(true)}>
                Skip, I'll add it later
              </Button>
            </>
          }
        >
          <FormError message={allowance.formError} />
          <Field label="Currency">
            {(id) => (
              <Select id={id} value={profile.values.currency} onChange={(e) => profile.set('currency', e.target.value)}>
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} · {c.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <AllowanceFields values={allowance.values} set={allowance.set} errors={allowance.errors} currency={profile.values.currency} />
        </Step>
      )}
    </div>
  )
}

function Step({
  step,
  icon,
  title,
  lead,
  children,
  footer,
  onBack,
}: {
  step: number
  icon: LucideIcon
  title: ReactNode
  lead: string
  children: ReactNode
  footer: ReactNode
  onBack?: () => void
}) {
  const welcome = step === 0
  return (
    <form
      className="flex flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault()
      }}
    >
      <div className={cn('relative overflow-hidden', welcome ? 'h-[44dvh] max-h-105 min-h-75' : 'h-60')}>
        <Arcs />
        <div className="pt-safe px-safe relative z-10 flex min-h-18 items-center justify-between pt-3">
          {onBack ? (
            <IconButton label="Back" onClick={onBack}>
              <ArrowLeft className="size-5" />
            </IconButton>
          ) : (
            <span className="size-11" />
          )}
          <div className="flex gap-1.5" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
            {STEPS.map((s, i) => (
              <span key={s} className={cn('h-2 rounded-full transition-all', i === step ? 'w-6 bg-accent' : i < step ? 'w-2 bg-accent' : 'w-2 bg-surface-3')} />
            ))}
          </div>
        </div>
        <Medallion icon={icon} large={welcome} />
        {welcome && <FloatingChips />}
      </div>

      <div
        className="relative z-10 -mt-8 flex flex-1 flex-col rounded-t-[36px] bg-surface px-6 pt-8 shadow-[0_-8px_30px_-16px_rgb(0_0_0/0.15)]"
        style={{ paddingBottom: 'max(20px, var(--sab))' }}
      >
        <div className="flex-1">
          <h1 className="text-center text-[32px] leading-[1.12] font-normal tracking-tight">{title}</h1>
          <p className="mx-auto mt-3 mb-8 max-w-80 text-center text-[14.5px] text-ink-2">{lead}</p>
          <FormStack>{children}</FormStack>
        </div>
        <div className="flex flex-col gap-2 pt-8">{footer}</div>
      </div>
    </form>
  )
}

/** "✓ Continue ›››" pill, styled like a slider but a plain button. */
function ContinueButton({ label = 'Continue', loading, onClick }: { label?: string; loading?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      aria-busy={loading || undefined}
      className="press relative flex h-16 w-full items-center rounded-full border border-line bg-surface-2 p-1.5 disabled:opacity-70"
    >
      <span className="flex size-13 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-card">
        {loading ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : <Check className="size-5" strokeWidth={2.6} aria-hidden />}
      </span>
      <span className="flex-1 text-center text-[16px] font-semibold">{label}</span>
      <span className="flex w-13 items-center justify-center text-ink" aria-hidden>
        <ChevronRight className="-mr-2.5 size-5 opacity-25" strokeWidth={2.4} />
        <ChevronRight className="-mr-2.5 size-5 opacity-55" strokeWidth={2.4} />
        <ChevronRight className="size-5" strokeWidth={2.4} />
      </span>
    </button>
  )
}

/** Point on a circle centred at (200, 300); 180° is left, 90° is the top. */
function pt(r: number, deg: number): string {
  const a = (deg * Math.PI) / 180
  return `${(200 + r * Math.cos(a)).toFixed(1)} ${(300 - r * Math.sin(a)).toFixed(1)}`
}
function arc(r: number, from: number, to: number): string {
  return `M ${pt(r, from)} A ${r} ${r} 0 0 1 ${pt(r, to)}`
}

const RINGS: Array<{ r: number; segments: Array<[number, number, string]> }> = [
  { r: 200, segments: [[124, 62, '#86d9a8'], [180, 166, '#8ccbec'], [16, 0, '#f6cf6a']] },
  { r: 150, segments: [[178, 128, '#f7a77f'], [52, 14, '#b3a8f5']] },
  { r: 100, segments: [[150, 112, '#f3a3c8']] },
]

/** Concentric half rings with pastel segments, behind the medallion. */
function Arcs() {
  return (
    <svg aria-hidden viewBox="0 0 400 300" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 size-full">
      {RINGS.map(({ r, segments }) => (
        <g key={r} fill="none" strokeWidth={36} strokeLinecap="round">
          <path d={arc(r, 180, 0)} stroke="var(--surface-3)" strokeOpacity={0.7} strokeLinecap="butt" />
          {segments.map(([from, to, color]) => (
            <path key={from} d={arc(r, from, to)} stroke={color} />
          ))}
        </g>
      ))}
    </svg>
  )
}

function Medallion({ icon: Icon, large }: { icon: LucideIcon; large: boolean }) {
  return (
    <div className={cn('absolute left-1/2 -translate-x-1/2', large ? 'bottom-12' : 'bottom-10')}>
      <div
        className={cn(
          'animate-float flex items-center justify-center rounded-full border-[6px] border-bg bg-surface shadow-float',
          large ? 'size-36' : 'size-24',
        )}
      >
        <Icon className={large ? 'size-16' : 'size-10'} strokeWidth={1.5} aria-hidden />
      </div>
    </div>
  )
}

const CHIPS: Array<{ label: string; icon: LucideIcon; tone: string; pos: string; delay: string }> = [
  { label: 'Classes', icon: CalendarDays, tone: 'bg-sky text-sky-ink', pos: 'left-[6%] bottom-[46%]', delay: '0s' },
  { label: 'Tasks', icon: CircleCheck, tone: 'bg-mint text-mint-ink', pos: 'right-[6%] bottom-[52%]', delay: '-1.3s' },
  { label: 'Budget', icon: Wallet, tone: 'bg-peach text-peach-ink', pos: 'right-[10%] bottom-[18%]', delay: '-2.6s' },
]

function FloatingChips() {
  return (
    <div aria-hidden>
      {CHIPS.map(({ label, icon: Icon, tone, pos, delay }) => (
        <span
          key={label}
          className={cn('animate-float absolute flex items-center gap-1.5 rounded-full bg-surface py-1 pr-3 pl-1 text-[12px] font-semibold shadow-float', pos)}
          style={{ animationDelay: delay }}
        >
          <span className={cn('flex size-6 items-center justify-center rounded-full', tone)}>
            <Icon className="size-3.5" strokeWidth={2.2} />
          </span>
          {label}
        </span>
      ))}
    </div>
  )
}
