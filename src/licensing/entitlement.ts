import { verifyAsync } from '@noble/ed25519'

/**
 * Offline verification of the signed entitlement the licensing server issues on activation.
 *
 *   STX1.<base64url(JSON claims)>.<base64url(Ed25519 signature over "STX1.<claims>")>
 *
 * Checked on every launch, with no network: the signature must come from one of the embedded
 * public keys, the claims must be for Studex Lifetime, and the entitlement must belong to this
 * installation (its id and device key). Editing any byte, copying the token to another phone, or
 * minting one without the server's private key all fail here.
 *
 * Keep in sync with server/src/entitlement.ts.
 */

export interface EntitlementClaims {
  v: 1
  aud: 'com.studex.app'
  kid: string
  lic: string
  hint: string
  act: string
  ins: string
  dk: string
  ed: 'lifetime'
  ch: 'web_android' | 'app_store' | 'google_play'
  iat: number
}

export type VerifyResult = { ok: true; claims: EntitlementClaims } | { ok: false; reason: 'malformed' | 'unknown_key' | 'bad_signature' | 'wrong_app' | 'other_device' }

function b64urlDecode(s: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) throw new Error('bad base64url')
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  return Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad), (c) => c.charCodeAt(0))
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function verifyEntitlement(
  token: string,
  keys: Record<string, string>,
  device: { installationId: string; devicePublicKey: string },
): Promise<VerifyResult> {
  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== 'STX1') return { ok: false, reason: 'malformed' }
  let claims: EntitlementClaims
  let signature: Uint8Array
  try {
    claims = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1]!))) as EntitlementClaims
    signature = b64urlDecode(parts[2]!)
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  if (!claims || typeof claims !== 'object' || typeof claims.kid !== 'string') return { ok: false, reason: 'malformed' }

  const key = Object.prototype.hasOwnProperty.call(keys, claims.kid) ? keys[claims.kid] : undefined
  if (!key) return { ok: false, reason: 'unknown_key' }
  let valid: boolean
  try {
    valid = signature.length === 64 && (await verifyAsync(signature, new TextEncoder().encode(`${parts[0]}.${parts[1]}`), b64urlDecode(key)))
  } catch {
    valid = false
  }
  if (!valid) return { ok: false, reason: 'bad_signature' }

  // Only trust the claims once the signature checks out.
  if (claims.v !== 1 || claims.aud !== 'com.studex.app' || claims.ed !== 'lifetime') return { ok: false, reason: 'wrong_app' }
  if (claims.ins !== device.installationId) return { ok: false, reason: 'other_device' }
  if (claims.dk !== (await sha256Hex(device.devicePublicKey)).slice(0, 32)) return { ok: false, reason: 'other_device' }
  return { ok: true, claims }
}
