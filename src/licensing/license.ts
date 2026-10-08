import { SecureStorage } from '@aparajita/capacitor-secure-storage'
import { LicenseError, post } from './api'
import { deviceDescription, getInstallation } from './device'
import { verifyEntitlement, type EntitlementClaims } from './entitlement'
import { LICENSE_PUBLIC_KEYS } from './keys'

/**
 * License state for this installation. The entitlement is stored in secure storage
 * (Keystore/Keychain), never in SQLite or backups: the license and the student's data are
 * independent, so nothing here can delete, corrupt or lock away academic or money records.
 */

const KEY = 'studex.entitlement'

export type LicenseState = { status: 'licensed'; claims: EntitlementClaims } | { status: 'unlicensed' }

export async function loadLicense(): Promise<LicenseState> {
  if (import.meta.env.DEV && import.meta.env.VITE_LICENSE_BYPASS === '1') {
    return { status: 'licensed', claims: { v: 1, aud: 'com.studex.app', kid: 'dev', lic: 'lic_dev', hint: 'DEV0', act: 'act_dev', ins: '', dk: '', ed: 'lifetime', ch: 'web_android', iat: 0 } }
  }
  let token: string | null
  try {
    token = (await SecureStorage.getItem(KEY)) as string | null
  } catch {
    token = null
  }
  if (!token) return { status: 'unlicensed' }
  const inst = await getInstallation()
  const result = await verifyEntitlement(token, LICENSE_PUBLIC_KEYS, inst)
  if (!result.ok) {
    console.warn('Stored entitlement rejected:', result.reason)
    return { status: 'unlicensed' }
  }
  return { status: 'licensed', claims: result.claims }
}

/** Checks a fresh entitlement before keeping it, so a bad server reply can't be stored. */
async function accept(token: unknown): Promise<LicenseState> {
  if (typeof token !== 'string') throw new LicenseError('unavailable', 'bad_response', 'Unexpected reply from the activation service. Please try again.')
  const result = await verifyEntitlement(token, LICENSE_PUBLIC_KEYS, await getInstallation())
  if (!result.ok) throw new LicenseError('unavailable', 'bad_entitlement', "Activation couldn't be verified on this phone. Please update Studex and try again.")
  await SecureStorage.setItem(KEY, token)
  return { status: 'licensed', claims: result.claims }
}

export async function activateWithCode(code: string): Promise<LicenseState> {
  const res = await post<{ entitlement: string }>('/activate', { code, ...(await deviceDescription()) })
  return accept(res.entitlement)
}

export async function startRestore(email: string): Promise<void> {
  await post('/restore/start', { email })
}

export async function finishRestore(email: string, code: string, transfer: boolean): Promise<LicenseState> {
  const res = await post<{ entitlement: string }>('/restore/verify', { email, code, transfer, ...(await deviceDescription()) })
  return accept(res.entitlement)
}

async function signed(purpose: 'deactivate' | 'status', claims: EntitlementClaims) {
  const inst = await getInstallation()
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = await inst.sign(`studex-${purpose}\n${claims.act}\n${inst.installationId}\n${timestamp}`)
  return { activationId: claims.act, installationId: inst.installationId, timestamp, signature }
}

/**
 * Frees this phone's seat so the license can be used on another device, then forgets the
 * entitlement here. Student data stays on the phone, untouched.
 */
export async function deactivateThisDevice(claims: EntitlementClaims): Promise<void> {
  await post('/deactivate', await signed('deactivate', claims))
  await SecureStorage.removeItem(KEY)
}

export interface RemoteStatus {
  activation: 'active' | 'deactivated' | 'replaced' | 'revoked'
  license: 'active' | 'suspended' | 'revoked'
}

/**
 * Optional check the student starts from Settings. Studex never calls this on its own: after
 * activation it works offline indefinitely. If the server says this phone's activation has
 * ended (moved to another phone, refunded), the local entitlement is removed.
 */
export async function checkStatus(claims: EntitlementClaims): Promise<RemoteStatus & { stillLicensed: boolean }> {
  const res = await post<RemoteStatus>('/status', await signed('status', claims))
  const stillLicensed = res.activation === 'active' && res.license !== 'revoked'
  if (!stillLicensed) await SecureStorage.removeItem(KEY)
  return { ...res, stillLicensed }
}
