import { useEffect, useState } from 'react'
import { KeyRound, LockKeyhole, ShieldOff } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { SwitchRow } from '@/components/ui/choice'
import { IconCircle, List, Row, Section } from '@/components/ui/display'
import { Field, TextInput } from '@/components/ui/fields'
import { Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { useAppLock } from '@/features/lock/lockContext'
import {
  biometryLabel,
  checkPin,
  clearLock,
  lockSupported,
  PIN_LENGTH,
  setBiometrics,
  setPin,
  unlockWithBiometrics,
  validPin,
} from '@/services/appLock'

type Flow = { kind: 'create' } | { kind: 'change' } | { kind: 'newPin' } | { kind: 'off' } | null

/** Optional PIN (and fingerprint or face) lock, kept off unless the student turns it on. */
export function AppLockSection() {
  const toast = useToast()
  const { config, refresh } = useAppLock()
  const [flow, setFlow] = useState<Flow>(null)
  const [bio, setBio] = useState<string | null>(null)

  useEffect(() => {
    void biometryLabel().then(setBio)
  }, [])

  if (!lockSupported) {
    return (
      <Section title="Privacy">
        <div className="card flex items-center gap-3 rounded-[28px] p-4">
          <IconCircle icon={LockKeyhole} tone="lilac" />
          <p className="text-subhead text-ink-2">App lock is available in the Studex app on your phone or tablet.</p>
        </div>
      </Section>
    )
  }

  const toggleBio = async (on: boolean) => {
    if (on && !(await unlockWithBiometrics(`Use ${bio} to unlock Studex`))) return
    await setBiometrics(on)
    await refresh()
  }

  return (
    <Section title="Privacy">
      <div className="card rounded-[28px] px-4 py-2">
        <SwitchRow
          label="App lock"
          hint={config ? 'Asks for your PIN when Studex opens, and after a minute away.' : 'Ask for a PIN when Studex opens.'}
          checked={!!config}
          onChange={(on) => setFlow(on ? { kind: 'create' } : { kind: 'off' })}
        />
        {config && bio && (
          <div className="border-t border-line">
            <SwitchRow label={`Unlock with ${bio}`} checked={config.biometrics} onChange={(on) => void toggleBio(on)} />
          </div>
        )}
      </div>
      {config && (
        <List className="mt-2.5">
          <Row onClick={() => setFlow({ kind: 'change' })} leading={<IconCircle icon={KeyRound} tone="sky" />} title="Change PIN" chevron />
        </List>
      )}
      <p className="mt-2.5 px-1 text-footnote text-ink-3">
        While the lock is on, Studex is hidden in the app switcher and, on Android, screenshots are blocked. The PIN is stored securely on
        this phone, never in your backups.
      </p>

      {(flow?.kind === 'create' || flow?.kind === 'newPin') && (
        <PinSheet
          title={flow.kind === 'newPin' ? 'New PIN' : 'Set a PIN'}
          action={flow.kind === 'newPin' ? 'Save new PIN' : 'Turn on app lock'}
          bio={bio}
          initialBio={config?.biometrics ?? true}
          onDone={async (pin, useBio) => {
            await setPin(pin, useBio)
            await refresh()
            toast(flow.kind === 'newPin' ? 'PIN changed' : 'App lock is on')
          }}
          onClose={() => setFlow(null)}
        />
      )}
      {flow?.kind === 'change' && (
        <VerifySheet title="Enter your current PIN" onVerified={() => setFlow({ kind: 'newPin' })} onClose={() => setFlow(null)} />
      )}
      {flow?.kind === 'off' && (
        <VerifySheet
          title="Turn off app lock"
          action="Turn off"
          onVerified={async () => {
            await clearLock()
            await refresh()
            setFlow(null)
            toast('App lock is off')
          }}
          onClose={() => setFlow(null)}
        />
      )}
    </Section>
  )
}

function PinInput({ id, value, onChange, invalid, describedBy, autoFocus }: { id: string; value: string; onChange: (v: string) => void; invalid?: boolean; describedBy?: string | undefined; autoFocus?: boolean }) {
  return (
    <TextInput
      id={id}
      aria-describedby={describedBy}
      type="password"
      inputMode="numeric"
      autoComplete="off"
      autoFocus={autoFocus}
      maxLength={PIN_LENGTH.max}
      className="tabular tracking-[0.4em]"
      value={value}
      invalid={invalid}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH.max))}
    />
  )
}

/** Choose a PIN, enter it again, and decide on fingerprint or face unlock. */
function PinSheet({
  title,
  action,
  bio,
  initialBio,
  onDone,
  onClose,
}: {
  title: string
  action: string
  bio: string | null
  initialBio: boolean
  onDone: (pin: string, biometrics: boolean) => Promise<void>
  onClose: () => void
}) {
  const [pin, setPinValue] = useState('')
  const [again, setAgain] = useState('')
  const [useBio, setUseBio] = useState(!!bio && initialBio)
  const [error, setError] = useState<{ pin?: string; again?: string; form?: string }>({})
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!validPin(pin)) return setError({ pin: `Use ${PIN_LENGTH.min} to ${PIN_LENGTH.max} digits` })
    if (again !== pin) return setError({ again: "The PINs don't match" })
    setBusy(true)
    try {
      await onDone(pin, useBio && !!bio)
      onClose()
    } catch (err) {
      setError({ form: err instanceof Error ? err.message : "The PIN couldn't be saved." })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={title}
      footer={
        <Button size="lg" block loading={busy} onClick={submit}>
          {action}
        </Button>
      }
    >
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        {error.form && <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-subhead text-danger">{error.form}</p>}
        <Field label="New PIN" error={error.pin} hint={`${PIN_LENGTH.min} to ${PIN_LENGTH.max} digits`}>
          {(id, d) => (
            <PinInput id={id} describedBy={d} autoFocus value={pin} invalid={!!error.pin} onChange={(v) => (setPinValue(v), setError({}))} />
          )}
        </Field>
        <Field label="Enter it again" error={error.again}>
          {(id, d) => <PinInput id={id} describedBy={d} value={again} invalid={!!error.again} onChange={(v) => (setAgain(v), setError({}))} />}
        </Field>
        {bio && <SwitchRow label={`Also unlock with ${bio}`} checked={useBio} onChange={setUseBio} />}
        <div className="flex gap-3 rounded-2xl bg-warn-soft px-4 py-3 text-subhead text-warn">
          <ShieldOff className="mt-0.5 size-4.5 shrink-0" aria-hidden />
          <p>
            If you forget your PIN{bio ? ` and can't use ${bio}` : ''}, Studex can't reset it. The only way back in is to clear the app's
            data, which deletes everything on this phone. Keep a backup (Settings → Your data).
          </p>
        </div>
      </form>
    </Sheet>
  )
}

/** Asks for the current PIN before a change; honours the same wrong-try limits as the lock screen. */
function VerifySheet({
  title,
  action = 'Continue',
  onVerified,
  onClose,
}: {
  title: string
  action?: string
  onVerified: () => void | Promise<void>
  onClose: () => void
}) {
  const [pin, setPinValue] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    try {
      const res = await checkPin(pin)
      if (res.ok) return await onVerified()
      setPinValue('')
      const wait = Math.ceil((res.retryAt - Date.now()) / 1000)
      setError(wait > 0 ? `Too many tries. Try again in ${wait >= 60 ? `${Math.ceil(wait / 60)} min` : `${wait} s`}.` : 'Wrong PIN')
    } catch {
      setError("Couldn't check your PIN. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={title}
      footer={
        <Button size="lg" block loading={busy} disabled={pin.length < PIN_LENGTH.min} onClick={submit}>
          {action}
        </Button>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <Field label="Current PIN" error={error}>
          {(id, d) => <PinInput id={id} describedBy={d} autoFocus value={pin} invalid={!!error} onChange={(v) => (setPinValue(v), setError(undefined))} />}
        </Field>
      </form>
    </Sheet>
  )
}
