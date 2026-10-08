import { createContext, useContext } from 'react'
import type { EntitlementClaims } from '@/licensing/entitlement'

export interface LicenseContextValue {
  claims: EntitlementClaims
  /** Called after this phone's activation ends (deactivated, or the server says it moved). */
  onEnded: () => void
}

export const LicenseContext = createContext<LicenseContextValue | null>(null)

export function useLicense(): LicenseContextValue {
  const v = useContext(LicenseContext)
  if (!v) throw new Error('useLicense outside LicenseGate')
  return v
}
