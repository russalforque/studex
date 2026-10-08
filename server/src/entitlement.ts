import { b64urlEncode, ed25519Sign, utf8 } from './crypto'

/**
 * The signed offline entitlement. The app verifies it with the embedded public key on every
 * launch and never needs the server again.
 *
 *   STX1.<base64url(JSON claims)>.<base64url(Ed25519 signature over "STX1.<claims>")>
 *
 * There is deliberately no expiry: Studex Lifetime keeps working offline indefinitely. The
 * trade-off is that a refund, revocation or device move can't take effect on a phone until that
 * phone talks to the server again (see docs/LICENSING.md).
 *
 * Keep in sync with src/licensing/entitlement.ts in the app.
 */

export const ENTITLEMENT_PREFIX = 'STX1'
export const APP_ID = 'com.studex.app'

export interface EntitlementClaims {
  v: 1
  aud: typeof APP_ID
  kid: string
  /** License id (public, not the secret code). */
  lic: string
  /** Last four characters of the license code, for display. */
  hint: string
  /** Activation id; the app sends it back to deactivate. */
  act: string
  /** The installation this entitlement is bound to. */
  ins: string
  /** sha256 of the installation's device public key (hex, first 32 chars). */
  dk: string
  ed: 'lifetime'
  ch: 'web_android' | 'app_store' | 'google_play'
  /** Issued at, unix seconds. */
  iat: number
}

export async function signEntitlement(privateKeyPkcs8: string, claims: EntitlementClaims): Promise<string> {
  const body = `${ENTITLEMENT_PREFIX}.${b64urlEncode(utf8(JSON.stringify(claims)))}`
  const sig = await ed25519Sign(privateKeyPkcs8, utf8(body))
  return `${body}.${b64urlEncode(sig)}`
}
