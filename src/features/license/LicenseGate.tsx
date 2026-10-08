import { useEffect, useState, type ReactNode } from 'react'
import { ErrorNotice, Loading } from '@/components/ui/display'
import { loadLicense, type LicenseState } from '@/licensing/license'
import { hideSplash } from '@/services/platform'
import { LicenseContext } from './licenseContext'
import { LicenseFlow } from './LicenseScreens'

/**
 * Shows the welcome / activation screens until this installation holds a valid signed
 * entitlement, then the app. The check is offline (signature + this installation's identity)
 * and runs before the database opens, so licensing can never touch or block the student's
 * data: deactivating or failing to activate leaves SQLite exactly as it was.
 */
export function LicenseGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LicenseState | 'loading' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    loadLicense()
      .then((s) => !cancelled && setState(s))
      .catch((err: unknown) => {
        console.error('Reading the license failed', err)
        if (!cancelled) setState('error')
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  useEffect(() => {
    // The database gate hides the splash once the app is ready; the welcome screens do it here.
    if (state !== 'loading' && (state === 'error' || state.status === 'unlicensed')) void hideSplash()
  }, [state])

  if (state === 'loading') return <Loading label="Opening Studex" />
  if (state === 'error') {
    return (
      <div className="pt-safe px-safe mx-auto flex min-h-dvh max-w-lg flex-col justify-center">
        <ErrorNotice
          message="Studex couldn't read its license on this phone. Your data is safe. Close and reopen the app, or try again."
          onRetry={() => {
            setState('loading')
            setAttempt((a) => a + 1)
          }}
        />
      </div>
    )
  }
  if (state.status === 'unlicensed') return <LicenseFlow onLicensed={setState} />
  return <LicenseContext.Provider value={{ claims: state.claims, onEnded: () => setState({ status: 'unlicensed' }) }}>{children}</LicenseContext.Provider>
}
