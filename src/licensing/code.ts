/**
 * License code format, checked before anything is sent so a typo doesn't use up an attempt.
 * Keep in sync with server/src/licenseCode.ts.
 */

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

function checkChar(body: string): string {
  let sum = 0
  for (let i = 0; i < body.length; i++) sum += ALPHABET.indexOf(body[i]!) * (i + 1)
  return ALPHABET[sum % 32]!
}

/** The 16 code characters without prefix or dashes, or null if it can't be a Studex code. */
export function normalizeCode(input: string): string | null {
  let s = input.toUpperCase().replace(/[\s-]/g, '')
  if (s.startsWith('STDX')) s = s.slice(4)
  s = s.replace(/O/g, '0').replace(/[IL]/g, '1')
  if (s.length !== 16) return null
  for (const c of s) if (!ALPHABET.includes(c)) return null
  return checkChar(s.slice(0, 15)) === s[15] ? s : null
}

/** Formats what's been typed so far as STDX-XXXX-XXXX-XXXX-XXXX. */
export function formatCodeInput(input: string): string {
  let s = input.toUpperCase().replace(/[^0-9A-Z]/g, '')
  if (s.startsWith('STDX')) s = s.slice(4)
  s = s.slice(0, 16)
  const groups = s.match(/.{1,4}/g) ?? []
  return groups.length ? `STDX-${groups.join('-')}` : ''
}

export function maskedCode(hint: string): string {
  return `STDX-••••-••••-••••-${hint}`
}
