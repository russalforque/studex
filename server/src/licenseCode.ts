import { pepperHash, randomInt } from './crypto'

/**
 * License codes look like STDX-7K2F-QM9D-X4TB-H8NR: 15 random Crockford base32 characters
 * (75 bits from crypto.getRandomValues) plus one check character, so a typo is caught before it
 * reaches the server or counts against the customer's attempts. The code is a secret: the
 * server stores only HMAC(pepper, code).
 *
 * Keep normalizeCode/checkChar in sync with src/licensing/code.ts in the app.
 */

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ' // Crockford: no I, L, O, U
const RANDOM_CHARS = 15

export function checkChar(body: string): string {
  let sum = 0
  for (let i = 0; i < body.length; i++) sum += ALPHABET.indexOf(body[i]!) * (i + 1)
  return ALPHABET[sum % 32]!
}

export function generateCode(): string {
  let body = ''
  for (let i = 0; i < RANDOM_CHARS; i++) body += ALPHABET[randomInt(32)]
  const chars = body + checkChar(body)
  return `STDX-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}-${chars.slice(12, 16)}`
}

/** Uppercases, drops spaces/dashes and the STDX prefix, and reads look-alikes the Crockford way. Null if malformed. */
export function normalizeCode(input: string): string | null {
  let s = input.toUpperCase().replace(/[\s-]/g, '')
  if (s.startsWith('STDX')) s = s.slice(4)
  s = s.replace(/O/g, '0').replace(/[IL]/g, '1')
  if (s.length !== RANDOM_CHARS + 1) return null
  for (const c of s) if (!ALPHABET.includes(c)) return null
  if (checkChar(s.slice(0, RANDOM_CHARS)) !== s[RANDOM_CHARS]) return null
  return s
}

export function codeHash(pepper: string, normalized: string): Promise<string> {
  return pepperHash(pepper, 'license-code', normalized)
}

export function codeHint(normalized: string): string {
  return normalized.slice(-4)
}
