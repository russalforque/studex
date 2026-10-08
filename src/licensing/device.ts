import { getPublicKeyAsync, signAsync, utils } from '@noble/ed25519'
import { Device } from '@capacitor/device'
import { SecureStorage } from '@aparajita/capacitor-secure-storage'
import { isNative } from '@/services/platform'
import { sha256Hex } from './entitlement'

/**
 * This installation's identity for licensing. Nothing here identifies the student:
 * - installationId: a random UUID made on first launch.
 * - device key: an Ed25519 key pair made on first launch. The private half stays in secure
 *   storage (Android Keystore / iOS Keychain) and signs "deactivate this phone" requests.
 * - device hint: a hash of the app-scoped device id (Android's per-app ANDROID_ID), so a
 *   reinstall on the same phone isn't counted as a new device. Never sent unhashed.
 * - label: phone model and OS version, so the customer recognises their devices in a list.
 *
 * All of it lives in secure storage, separate from SQLite and never in backups.
 */

const KEY = 'studex.installation'

interface StoredIdentity {
  installationId: string
  secretKey: string
}

export interface Installation {
  installationId: string
  devicePublicKey: string
  sign: (message: string) => Promise<string>
}

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

let cached: Promise<Installation> | null = null

async function readIdentity(): Promise<StoredIdentity | null> {
  try {
    const raw = await SecureStorage.getItem(KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as Partial<StoredIdentity>
    return typeof v.installationId === 'string' && typeof v.secretKey === 'string' ? { installationId: v.installationId, secretKey: v.secretKey } : null
  } catch {
    // Unreadable (for example restored by Android backup onto a phone without the Keystore key):
    // treat as a new installation. The customer restores their purchase; no data is touched.
    return null
  }
}

export function getInstallation(): Promise<Installation> {
  cached ??= (async () => {
    let identity = await readIdentity()
    if (!identity) {
      identity = { installationId: crypto.randomUUID(), secretKey: b64url(utils.randomSecretKey()) }
      await SecureStorage.setItem(KEY, JSON.stringify(identity))
    }
    const secret = unb64url(identity.secretKey)
    const devicePublicKey = b64url(await getPublicKeyAsync(secret))
    return {
      installationId: identity.installationId,
      devicePublicKey,
      sign: async (message: string) => b64url(await signAsync(new TextEncoder().encode(message), secret)),
    }
  })().catch((err: unknown) => {
    cached = null
    throw err
  })
  return cached
}

/** What the server needs to activate this installation. */
export async function deviceDescription() {
  const inst = await getInstallation()
  let deviceHint: string | null = null
  let deviceLabel = 'Web browser'
  let platform: 'android' | 'ios' | 'web' = 'web'
  if (isNative) {
    try {
      const [{ identifier }, info] = await Promise.all([Device.getId(), Device.getInfo()])
      platform = info.platform === 'ios' ? 'ios' : 'android'
      deviceHint = (await sha256Hex(`studex-device-hint:${identifier}`)).slice(0, 43)
      deviceLabel = `${info.model} · ${info.platform === 'ios' ? 'iOS' : 'Android'} ${info.osVersion}`.slice(0, 80)
    } catch {
      platform = /iphone|ipad/i.test(navigator.userAgent) ? 'ios' : 'android'
    }
  }
  return {
    installationId: inst.installationId,
    devicePublicKey: inst.devicePublicKey,
    deviceHint,
    platform,
    deviceLabel,
    appVersion: __APP_VERSION__,
  }
}
