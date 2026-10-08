import { useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CalendarDays, CircleCheck, GraduationCap, Wallet, type LucideIcon } from 'lucide-react'
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
import { Arcs, ContinueButton, Medallion } from '@/components/layout/HeroArt'

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
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col rail:max-w-none">
      {step === 0 && (
        <Step
          step={0}
          icon={GraduationCap}
          title={
            <>
              Thrilled to join your
              <br />
              <b className="font-extrabold">learning journey!</b>
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
              Set up this <b className="font-extrabold">term</b>
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
              Your <b className="font-extrabold">allowance</b>
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
    // Landscape tablets and phones: illustration on the left, the form card on the right.
    <form
      className="flex flex-1 flex-col rail:landscape:flex-row"
      onSubmit={(e) => {
        e.preventDefault()
      }}
    >
      <div
        className={cn(
          'relative overflow-hidden',
          welcome ? 'h-[44dvh] max-h-105 min-h-75' : 'h-60',
          'rail:landscape:sticky rail:landscape:top-0 rail:landscape:h-dvh rail:landscape:max-h-none rail:landscape:min-h-0 rail:landscape:flex-1',
        )}
      >
        <Arcs />
        <div className="pt-safe px-safe relative z-10 flex min-h-18 items-center justify-between pt-3 rail:landscape:justify-start rail:landscape:gap-4">
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
        className="relative z-10 -mt-8 flex flex-1 flex-col rounded-t-[36px] bg-surface px-6 pt-8 shadow-[0_-8px_30px_-16px_rgb(0_0_0/0.15)] rail:px-10 rail:landscape:mt-0 rail:landscape:-ml-8 rail:landscape:w-[min(520px,50%)] rail:landscape:flex-none rail:landscape:rounded-tr-none rail:landscape:rounded-l-[36px] rail:landscape:pt-[calc(var(--sat)+32px)]"
        style={{ paddingBottom: 'max(20px, var(--sab))' }}
      >
        <div className="mx-auto w-full max-w-md flex-1">
          <h1 className="text-center text-display-sm font-normal">{title}</h1>
          <p className="mx-auto mt-3 mb-8 max-w-80 text-center text-body text-ink-2">{lead}</p>
          <FormStack>{children}</FormStack>
        </div>
        <div className="mx-auto flex w-full max-w-md flex-col gap-2 pt-8">{footer}</div>
      </div>
    </form>
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
          className={cn('animate-float absolute flex items-center gap-1.5 rounded-full bg-surface py-1 pr-3 pl-1 text-caption font-semibold shadow-float', pos)}
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
