import { BiometricAuth, BiometryType } from '@aparajita/capacitor-biometric-auth'
import { SecureStorage } from '@aparajita/capacitor-secure-storage'
import { PrivacyScreen } from '@capacitor-community/privacy-screen'
import { isNative } from './platform'

/**
 * Optional app lock. The PIN itself is never stored: only a salted PBKDF2 hash, kept in the
 * platform's secure storage (iOS Keychain, Android Keystore-backed storage), never in SQLite or
 * in backups. The lock is a privacy screen in front of the app; it doesn't encrypt the database,
 * so a forgotten PIN can't be reset from inside Studex.
 */

export const lockSupported = isNative

const KEY = 'studex.lock'
const ITERATIONS = 210_000
export const PIN_LENGTH = { min: 4, max: 8 }
/** Back after this long in the background, Studex asks again. Short trips (camera, file picker) don't. */
export const RELOCK_AFTER_MS = 60_000

export interface LockConfig {
  salt: string
  hash: string
  iterations: number
  biometrics: boolean
  /** Digits in the PIN, so the keypad can unlock as soon as the last one is entered. */
  length: number
  /** Wrong tries in a row, and when the next try is allowed (epoch ms). */
  failures: number
  retryAt: number
}

const b64 = (bytes: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(bytes)))
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function derive(pin: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256)
  return b64(bits)
}

/** Constant-time comparison, so timing doesn't reveal how much of a guess was right. */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export function validPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH.min},${PIN_LENGTH.max}}$`).test(pin)
}

/** Waiting time after `failures` wrong tries in a row: none for the first 4, then 30 s, 1 min, 5 min… */
export function lockoutMs(failures: number): number {
  if (failures < 5) return 0
  return [30_000, 60_000, 5 * 60_000, 15 * 60_000][Math.min(failures - 5, 3)]!
}

export async function readLock(): Promise<LockConfig | null> {
  if (!lockSupported) return null
  const raw = await SecureStorage.getItem(KEY)
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as Partial<LockConfig>
    if (typeof v.salt !== 'string' || typeof v.hash !== 'string' || typeof v.iterations !== 'number') return null
    return {
      salt: v.salt,
      hash: v.hash,
      iterations: v.iterations,
      biometrics: v.biometrics === true,
      length: typeof v.length === 'number' ? v.length : PIN_LENGTH.max,
      failures: typeof v.failures === 'number' ? v.failures : 0,
      retryAt: typeof v.retryAt === 'number' ? v.retryAt : 0,
    }
  } catch {
    return null
  }
}

async function writeLock(cfg: LockConfig): Promise<void> {
  await SecureStorage.setItem(KEY, JSON.stringify(cfg))
}

export async function setPin(pin: string, biometrics: boolean): Promise<void> {
  if (!validPin(pin)) throw new Error(`Use ${PIN_LENGTH.min} to ${PIN_LENGTH.max} digits.`)
  const salt = crypto.getRandomValues(new Uint8Array(16))
  await writeLock({ salt: b64(salt), hash: await derive(pin, salt, ITERATIONS), iterations: ITERATIONS, biometrics, length: pin.length, failures: 0, retryAt: 0 })
  await setPrivacyScreen(true)
}

export async function setBiometrics(on: boolean): Promise<void> {
  const cfg = await readLock()
  if (cfg) await writeLock({ ...cfg, biometrics: on })
}

export type PinResult = { ok: true } | { ok: false; retryAt: number; failures: number }

/** Checks a PIN, counting wrong tries; refuses to check at all while waiting out a lockout. */
export async function checkPin(pin: string, now = Date.now()): Promise<PinResult> {
  const cfg = await readLock()
  if (!cfg) return { ok: true }
  if (now < cfg.retryAt) return { ok: false, retryAt: cfg.retryAt, failures: cfg.failures }
  const ok = same(await derive(pin, unb64(cfg.salt), cfg.iterations), cfg.hash)
  if (ok) {
    if (cfg.failures) await writeLock({ ...cfg, failures: 0, retryAt: 0 })
    return { ok: true }
  }
  const failures = cfg.failures + 1
  const retryAt = now + lockoutMs(failures)
  await writeLock({ ...cfg, failures, retryAt })
  return { ok: false, retryAt, failures }
}

export async function clearLock(): Promise<void> {
  await SecureStorage.removeItem(KEY)
  await setPrivacyScreen(false)
}

/** Fingerprint or face unlock, if the device has it set up. */
export async function biometryLabel(): Promise<string | null> {
  if (!lockSupported) return null
  try {
    const r = await BiometricAuth.checkBiometry()
    if (!r.isAvailable) return null
    switch (r.biometryType) {
      case BiometryType.faceId:
        return 'Face ID'
      case BiometryType.touchId:
        return 'Touch ID'
      case BiometryType.faceAuthentication:
        return 'Face unlock'
      case BiometryType.fingerprintAuthentication:
        return 'Fingerprint'
      default:
        return 'Biometrics'
    }
  } catch {
    return null
  }
}

/** True when the device confirmed the student; false if cancelled or failed. */
export async function unlockWithBiometrics(reason: string): Promise<boolean> {
  try {
    await BiometricAuth.authenticate({
      reason,
      cancelTitle: 'Use PIN',
      iosFallbackTitle: 'Use PIN',
      androidTitle: 'Unlock Studex',
      allowDeviceCredential: false,
    })
    // A successful biometric unlock also clears any PIN lockout.
    const cfg = await readLock()
    if (cfg?.failures) await writeLock({ ...cfg, failures: 0, retryAt: 0 })
    return true
  } catch {
    return false
  }
}

/** Hides Studex's content in the app switcher while the lock is on. */
export async function setPrivacyScreen(on: boolean): Promise<void> {
  if (!lockSupported) return
  try {
    await (on ? PrivacyScreen.enable() : PrivacyScreen.disable())
  } catch (err) {
    console.warn('Privacy screen unavailable', err)
  }
}
