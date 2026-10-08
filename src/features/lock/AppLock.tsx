import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Delete, Fingerprint, Lock } from 'lucide-react'
import { Sheet } from '@/components/ui/Sheet'
import {
  biometryLabel,
  checkPin,
  lockoutMs,
  lockSupported,
  readLock,
  RELOCK_AFTER_MS,
  setPrivacyScreen,
  unlockWithBiometrics,
  type LockConfig,
} from '@/services/appLock'
import { pushBackHandler } from '@/services/backStack'
import { cn } from '@/utils/cn'
import { LockContext } from './lockContext'

/**
 * Puts the lock screen in front of the app when it opens, and again when it comes back after
 * more than a minute away. The app stays mounted underneath, so unlocking returns the student to
 * exactly where they were (a half-filled form, a scan in progress).
 */
export function AppLockGate({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<LockConfig | null | undefined>(lockSupported ? undefined : null)
  const [locked, setLocked] = useState(false)
  const hiddenAt = useRef<number | null>(null)

  const refresh = useCallback(async () => {
    const cfg = await readLock().catch(() => null)
    setConfig(cfg)
    await setPrivacyScreen(!!cfg)
  }, [])

  useEffect(() => {
    if (!lockSupported) return
    let cancelled = false
    readLock()
      .catch(() => null)
      .then((cfg) => {
        if (cancelled) return
        setConfig(cfg)
        setLocked(!!cfg)
        void setPrivacyScreen(!!cfg)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!config) return
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') hiddenAt.current = Date.now()
      else if (hiddenAt.current !== null && Date.now() - hiddenAt.current >= RELOCK_AFTER_MS) setLocked(true)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [config])

  // Nothing is shown until it's known whether the app is locked.
  if (config === undefined) return <div className="min-h-dvh bg-bg" />

  return (
    <LockContext.Provider value={{ config, refresh }}>
      {children}
      {locked && config && <LockScreen config={config} onUnlock={() => setLocked(false)} />}
    </LockContext.Provider>
  )
}

function LockScreen({ config, onUnlock }: { config: LockConfig; onUnlock: () => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [retryAt, setRetryAt] = useState(config.retryAt)
  const [now, setNow] = useState(() => Date.now())
  const [bio, setBio] = useState<string | null>(null)
  const [forgot, setForgot] = useState(false)
  const triedBio = useRef(false)

  // Back does nothing while locked: there's nothing behind the lock to go back to.
  useEffect(() => pushBackHandler(() => undefined), [])

  useEffect(() => {
    if (!config.biometrics) return
    let cancelled = false
    void biometryLabel().then(async (label) => {
      if (cancelled || !label) return
      setBio(label)
      if (triedBio.current) return
      triedBio.current = true
      if (await unlockWithBiometrics('Unlock Studex')) onUnlock()
    })
    return () => {
      cancelled = true
    }
  }, [config.biometrics, onUnlock])

  const waiting = retryAt > now
  useEffect(() => {
    if (!waiting) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [waiting])

  const submit = async (value: string) => {
    setBusy(true)
    try {
      const res = await checkPin(value)
      if (res.ok) return onUnlock()
      setPin('')
      // A lockout shows its own countdown (the interval below keeps `now` current).
      setRetryAt(res.retryAt)
      setError(lockoutMs(res.failures) > 0 ? null : 'Wrong PIN. Try again.')
    } catch {
      setPin('')
      setError("Couldn't check your PIN. Try again.")
    } finally {
      setBusy(false)
    }
  }

  const press = (d: string) => {
    if (busy || waiting) return
    setError(null)
    const next = (pin + d).slice(0, config.length)
    setPin(next)
    if (next.length === config.length) void submit(next)
  }

  const seconds = Math.ceil((retryAt - now) / 1000)

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Studex is locked" className="fixed inset-0 z-100 flex flex-col bg-bg">
      <div className="pt-safe px-safe mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center" style={{ paddingBottom: 'var(--sab)' }}>
        <span className="flex size-14 items-center justify-center rounded-full bg-surface-2 text-ink">
          <Lock className="size-6" aria-hidden />
        </span>
        <h1 className="mt-4 text-title-2 font-bold">Enter your PIN</h1>
        <p className="mt-1 min-h-5 text-subhead text-ink-2" role="status" aria-live="polite">
          {waiting ? `Too many tries. Try again in ${seconds >= 60 ? `${Math.ceil(seconds / 60)} min` : `${seconds} s`}.` : (error ?? '')}
        </p>
        <div className="mt-5 flex h-4 gap-3" aria-label={`${pin.length} digits entered`}>
          {Array.from({ length: config.length }, (_, i) => (
            <span key={i} className={cn('size-3.5 rounded-full border-2 border-ink', i < pin.length ? 'bg-ink' : 'bg-transparent')} />
          ))}
        </div>
        <div className="mt-8 grid w-full grid-cols-3 gap-3 px-6">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <PadKey key={d} label={d} onClick={() => press(d)} disabled={busy || waiting} />
          ))}
          {bio ? (
            <button
              type="button"
              aria-label={`Unlock with ${bio}`}
              onClick={() => void unlockWithBiometrics('Unlock Studex').then((ok) => ok && onUnlock())}
              className="press flex h-16 items-center justify-center rounded-full text-ink active:bg-surface-2"
            >
              <Fingerprint className="size-7" aria-hidden />
            </button>
          ) : (
            <span />
          )}
          <PadKey label="0" onClick={() => press('0')} disabled={busy || waiting} />
          <button
            type="button"
            aria-label="Delete last digit"
            disabled={!pin}
            onClick={() => setPin((p) => p.slice(0, -1))}
            className="press flex h-16 items-center justify-center rounded-full text-ink active:bg-surface-2 disabled:opacity-30"
          >
            <Delete className="size-6" aria-hidden />
          </button>
        </div>
        <button type="button" onClick={() => setForgot(true)} className="press mt-6 min-h-11 px-4 text-subhead font-semibold text-ink-2">
          Forgot PIN?
        </button>
      </div>
      {forgot && (
        <Sheet open onClose={() => setForgot(false)} title="Forgot your PIN?">
          <div className="flex flex-col gap-3 text-body text-ink-2">
            {bio && config.biometrics && <p>Unlock with {bio}, then set a new PIN in Settings → App lock.</p>}
            <p>
              For your privacy, the PIN can't be recovered or reset from inside Studex, and nobody else (including Studex) can do it
              for you.
            </p>
            <p>
              The only other way back in is to clear Studex's data in your phone's settings, or reinstall the app. That deletes
              everything on this device. If you saved a backup, you can restore it afterwards.
            </p>
          </div>
        </Sheet>
      )}
    </div>,
    document.body,
  )
}

function PadKey({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="press tabular flex h-16 items-center justify-center rounded-full bg-surface text-large-title font-semibold text-ink shadow-card active:bg-surface-2 disabled:opacity-40"
    >
      {label}
    </button>
  )
}
