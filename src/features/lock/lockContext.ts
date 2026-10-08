import { createContext, useContext } from 'react'
import { clearLock, lockSupported, readLock, type LockConfig } from '@/services/appLock'

export interface LockContextValue {
  config: LockConfig | null
  /** Re-read after the settings screen changes the lock. */
  refresh: () => Promise<void>
}

export const LockContext = createContext<LockContextValue>({ config: null, refresh: async () => undefined })

export function useAppLock() {
  return useContext(LockContext)
}

/** Clears a lock left in the Keychain by an earlier install (iOS keeps it after uninstalling). */
export async function clearStaleLock(): Promise<void> {
  if (lockSupported && (await readLock().catch(() => null))) await clearLock()
}
