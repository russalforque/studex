import { useState, type FormEvent, type ReactNode } from 'react'
import { ArrowLeft, GraduationCap, KeyRound, MailCheck, Smartphone, type LucideIcon } from 'lucide-react'
import { Arcs, ContinueButton, Medallion } from '@/components/layout/HeroArt'
import { Button, IconButton } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/fields'
import { FormError, FormStack } from '@/features/shared/formParts'
import { LicenseError } from '@/licensing/api'
import { formatCodeInput, normalizeCode } from '@/licensing/code'
import { STORE_URL, SUPPORT_EMAIL } from '@/licensing/keys'
import { activateWithCode, finishRestore, startRestore, type LicenseState } from '@/licensing/license'
import { errorMessage } from '@/repositories/errors'
import { formatDate, toISODate } from '@/utils/dates'
import { cn } from '@/utils/cn'

type Screen = 'welcome' | 'activate' | 'restore'

/** Welcome → Activate (license code) or Restore purchase (email). */
export function LicenseFlow({ onLicensed }: { onLicensed: (s: LicenseState) => void }) {
  const [screen, setScreen] = useState<Screen>('welcome')
  if (screen === 'activate') return <ActivateScreen onBack={() => setScreen('welcome')} onRestore={() => setScreen('restore')} onLicensed={onLicensed} />
  if (screen === 'restore') return <RestoreScreen onBack={() => setScreen('welcome')} onLicensed={onLicensed} />
  return <WelcomeScreen onActivate={() => setScreen('activate')} onRestore={() => setScreen('restore')} />
}

function WelcomeScreen({ onActivate, onRestore }: { onActivate: () => void; onRestore: () => void }) {
  return (
    <Shell
      icon={GraduationCap}
      large
      title={
        <>
          <b className="font-extrabold">STUDEX</b>
          <br />
          Your student life, organized.
        </>
      }
      lead="Classes, tasks, exams, allowance and savings in one calm place. Everything stays on this phone and works offline."
      footer={
        <>
          <ContinueButton label="Activate Studex" onClick={onActivate} />
          <Button variant="ghost" block onClick={onRestore}>
            Restore purchase
          </Button>
        </>
      }
    >
      <p className="text-center text-subhead text-ink-2">
        Don't have Studex yet?{' '}
        <a href={STORE_URL} target="_blank" rel="noreferrer" className="font-semibold text-ink underline underline-offset-2">
          Get it once, keep it for life
        </a>
      </p>
    </Shell>
  )
}

function ActivateScreen({ onBack, onRestore, onLicensed }: { onBack: () => void; onRestore: () => void; onLicensed: (s: LicenseState) => void }) {
  const [code, setCode] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [error, setError] = useState<{ message: string; deviceLimit?: boolean } | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    if (busy) return
    setError(null)
    if (!normalizeCode(code)) {
      setFieldError('Check the code: it looks like STDX-XXXX-XXXX-XXXX-XXXX and is in your purchase email.')
      return
    }
    setFieldError(null)
    setBusy(true)
    try {
      onLicensed(await activateWithCode(code))
    } catch (err) {
      const deviceLimit = err instanceof LicenseError && err.code === 'device_limit'
      setError({
        message: deviceLimit
          ? 'Studex is already active on another device. To move it to this phone, restore your purchase with your email; you can do this even if the old phone is lost.'
          : errorMessage(err),
        deviceLimit,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell
      icon={KeyRound}
      onBack={onBack}
      onSubmit={submit}
      title={
        <>
          Activate <b className="font-extrabold">Studex</b>
        </>
      }
      lead="Enter your lifetime license code. You only need the internet this once."
      footer={
        <>
          <ContinueButton label="Activate" loading={busy} onClick={() => void submit()} />
          <Button variant="ghost" block disabled={busy} onClick={onRestore}>
            Already purchased? Restore purchase
          </Button>
        </>
      }
    >
      <FormError message={error?.message ?? null} />
      {error?.deviceLimit && (
        <Button variant="secondary" block onClick={onRestore}>
          Move Studex to this phone
        </Button>
      )}
      <Field label="License code" error={fieldError ?? undefined} hint="From your purchase email or the payment page">
        {(id, d) => (
          <TextInput
            id={id}
            aria-describedby={d}
            value={code}
            invalid={!!fieldError}
            onChange={(e) => setCode(formatCodeInput(e.target.value))}
            placeholder="STDX-XXXX-XXXX-XXXX-XXXX"
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            className="font-mono tracking-wide"
          />
        )}
      </Field>
    </Shell>
  )
}

type RestoreStep =
  | { kind: 'email' }
  | { kind: 'code' }
  | { kind: 'move'; devices: { label: string | null; platform: string; since: number }[] }
  | { kind: 'review'; message: string }

function RestoreScreen({ onBack, onLicensed }: { onBack: () => void; onLicensed: (s: LicenseState) => void }) {
  const [step, setStep] = useState<RestoreStep>({ kind: 'email' })
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async (fn: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (err) {
      if (err instanceof LicenseError && err.code === 'device_limit') {
        setStep({ kind: 'move', devices: (err.data.devices as { label: string | null; platform: string; since: number }[]) ?? [] })
      } else if (err instanceof LicenseError && err.code === 'transfer_limit') {
        setStep({ kind: 'review', message: err.message })
      } else {
        setError(errorMessage(err))
      }
    } finally {
      setBusy(false)
    }
  }

  const sendCode = () =>
    run(async () => {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw new Error('Enter the email address you used to buy Studex.')
      await startRestore(email.trim())
      setCode('')
      setStep({ kind: 'code' })
    })
  const verify = (transfer: boolean) =>
    run(async () => {
      if (code.replace(/\D/g, '').length !== 6) throw new Error('Enter the 6-digit code from the email.')
      onLicensed(await finishRestore(email.trim(), code.replace(/\D/g, ''), transfer))
    })

  const dataNote = (
    <p className="rounded-2xl bg-surface-2 px-4 py-3 text-footnote text-ink-2">
      Restoring your purchase unlocks Studex. It doesn't bring back classes, notes or money records; those live on your phone. If you
      made a backup, restore it after activating in Settings → Data.
    </p>
  )

  if (step.kind === 'review') {
    return (
      <Shell icon={MailCheck} onBack={onBack} title={<>We'll check this one</>} lead={step.message} footer={<Button variant="secondary" block onClick={onBack}>Done</Button>}>
        <p className="text-center text-subhead text-ink-2">
          Questions? Write to <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-ink underline underline-offset-2">{SUPPORT_EMAIL}</a>
        </p>
      </Shell>
    )
  }

  if (step.kind === 'move') {
    return (
      <Shell
        icon={Smartphone}
        onBack={() => setStep({ kind: 'code' })}
        title={
          <>
            Move Studex to <b className="font-extrabold">this phone?</b>
          </>
        }
        lead="Your license is active on another device. Moving it turns Studex off there the next time that device checks in. You don't need the old phone."
        footer={
          <>
            <ContinueButton label="Move to this phone" loading={busy} onClick={() => void verify(true)} />
            <Button variant="ghost" block disabled={busy} onClick={onBack}>
              Cancel
            </Button>
          </>
        }
      >
        <FormError message={error} />
        <ul className="flex flex-col gap-2">
          {step.devices.map((d, i) => (
            <li key={i} className="card flex items-center gap-3 rounded-[22px] p-3">
              <Smartphone className="size-5 text-ink-2" aria-hidden />
              <div>
                <p className="text-body font-semibold">{d.label ?? (d.platform === 'ios' ? 'iPhone' : 'Android phone')}</p>
                <p className="text-footnote text-ink-2">Active since {formatDate(toISODate(new Date(d.since * 1000)), { day: 'numeric', month: 'short', year: 'numeric' })}</p>
              </div>
            </li>
          ))}
        </ul>
      </Shell>
    )
  }

  if (step.kind === 'code') {
    return (
      <Shell
        icon={MailCheck}
        onBack={() => setStep({ kind: 'email' })}
        onSubmit={(e) => {
          e.preventDefault()
          void verify(false)
        }}
        title={
          <>
            Check your <b className="font-extrabold">email</b>
          </>
        }
        lead={`If ${email.trim()} has a Studex purchase, we sent it a 6-digit code. It can take a minute; check spam too.`}
        footer={
          <>
            <ContinueButton label="Restore purchase" loading={busy} onClick={() => void verify(false)} />
            <Button variant="ghost" block disabled={busy} onClick={() => void sendCode()}>
              Send a new code
            </Button>
          </>
        }
      >
        <FormError message={error} />
        <Field label="6-digit code">
          {(id) => (
            <TextInput
              id={id}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              enterKeyHint="go"
              className="text-center font-mono text-title-3 tracking-[0.4em]"
            />
          )}
        </Field>
        {dataNote}
      </Shell>
    )
  }

  return (
    <Shell
      icon={MailCheck}
      onBack={onBack}
      onSubmit={(e) => {
        e.preventDefault()
        void sendCode()
      }}
      title={
        <>
          Restore your <b className="font-extrabold">purchase</b>
        </>
      }
      lead="Already bought Studex? Enter your purchase email and we'll send a code to confirm it's you. No need to pay again."
      footer={<ContinueButton label="Continue" loading={busy} onClick={() => void sendCode()} />}
    >
      <FormError message={error} />
      <Field label="Purchase email">
        {(id) => (
          <TextInput
            id={id}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            enterKeyHint="send"
          />
        )}
      </Field>
      {dataNote}
    </Shell>
  )
}

/** The onboarding look: pastel arcs and a medallion above a rounded card. */
function Shell({
  icon,
  large,
  title,
  lead,
  children,
  footer,
  onBack,
  onSubmit,
}: {
  icon: LucideIcon
  large?: boolean
  title: ReactNode
  lead: string
  children?: ReactNode
  footer: ReactNode
  onBack?: () => void
  onSubmit?: (e: FormEvent) => void
}) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col rail:max-w-none">
      <form className="flex flex-1 flex-col rail:landscape:flex-row" onSubmit={onSubmit ?? ((e) => e.preventDefault())} noValidate>
        <div
          className={cn(
            'relative overflow-hidden',
            large ? 'h-[44dvh] max-h-105 min-h-75' : 'h-60',
            'rail:landscape:sticky rail:landscape:top-0 rail:landscape:h-dvh rail:landscape:max-h-none rail:landscape:min-h-0 rail:landscape:flex-1',
          )}
        >
          <Arcs />
          <div className="pt-safe px-safe relative z-10 flex min-h-18 items-center pt-3">
            {onBack ? (
              <IconButton label="Back" onClick={onBack}>
                <ArrowLeft className="size-5" />
              </IconButton>
            ) : (
              <span className="size-11" />
            )}
          </div>
          <Medallion icon={icon} large={!!large} />
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
    </div>
  )
}
