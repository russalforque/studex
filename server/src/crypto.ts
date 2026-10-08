/** Small Web Crypto helpers. Everything here runs unchanged on Cloudflare Workers and Node 20+. */

const enc = new TextEncoder()
const dec = new TextDecoder()

export function b64urlEncode(bytes: Uint8Array | ArrayBuffer): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let s = ''
  for (const b of arr) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function b64urlDecode(s: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('Invalid base64url')
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  return Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad), (c) => c.charCodeAt(0))
}

export function b64Decode(s: string): Uint8Array {
  return Uint8Array.from(atob(s.trim()), (c) => c.charCodeAt(0))
}

export function utf8(s: string): Uint8Array {
  return enc.encode(s)
}

export function fromUtf8(b: Uint8Array): string {
  return dec.decode(b)
}

export function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n))
}

/** Unguessable identifier with a readable prefix, e.g. ord_3J9…, 128 bits of randomness. */
export function randomId(prefix: string): string {
  return `${prefix}_${b64urlEncode(randomBytes(16))}`
}

/** A URL-safe secret token (256 bits). */
export function randomToken(): string {
  return b64urlEncode(randomBytes(32))
}

/** Uniform random integer in [0, max) without modulo bias. */
export function randomInt(max: number): number {
  const limit = Math.floor(0x1_0000_0000 / max) * max
  const buf = new Uint32Array(1)
  for (;;) {
    crypto.getRandomValues(buf)
    if (buf[0]! < limit) return buf[0]! % max
  }
}

export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === 'string' ? utf8(data) : data
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return toHex(new Uint8Array(digest))
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

const hmacKeys = new Map<string, Promise<CryptoKey>>()

function hmacKey(secret: string, rawBytes: boolean): Promise<CryptoKey> {
  const id = (rawBytes ? 'b64:' : 'txt:') + secret
  let key = hmacKeys.get(id)
  if (!key) {
    const material = rawBytes ? b64Decode(secret) : utf8(secret)
    key = crypto.subtle.importKey('raw', material as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    hmacKeys.set(id, key)
  }
  return key
}

/** HMAC-SHA256 as hex. `secret` is text (e.g. a PayMongo webhook secret). */
export async function hmacHex(secret: string, message: string): Promise<string> {
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret, false), utf8(message) as BufferSource)
  return toHex(new Uint8Array(sig))
}

/** HMAC-SHA256 keyed by a base64 secret (the pepper), domain-separated by `purpose`. */
export async function pepperHash(pepperB64: string, purpose: string, value: string): Promise<string> {
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(pepperB64, true), utf8(`${purpose}\u0000${value}`) as BufferSource)
  return b64urlEncode(sig)
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// --- AES-GCM for the short-lived copy of a new license code -------------------------------------

async function aesKey(keyB64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', b64Decode(keyB64) as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function seal(keyB64: string, plaintext: string, aad: string): Promise<string> {
  const iv = randomBytes(12)
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource, additionalData: utf8(aad) as BufferSource },
    await aesKey(keyB64),
    utf8(plaintext) as BufferSource,
  )
  return `${b64urlEncode(iv)}.${b64urlEncode(ct)}`
}

export async function open(keyB64: string, sealed: string, aad: string): Promise<string> {
  const [iv, ct] = sealed.split('.')
  if (!iv || !ct) throw new Error('Malformed sealed value')
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64urlDecode(iv) as BufferSource, additionalData: utf8(aad) as BufferSource },
    await aesKey(keyB64),
    b64urlDecode(ct) as BufferSource,
  )
  return fromUtf8(new Uint8Array(pt))
}

// --- Ed25519 -----------------------------------------------------------------------------------

const signingKeys = new Map<string, Promise<CryptoKey>>()

export function importSigningKey(pkcs8B64: string): Promise<CryptoKey> {
  let key = signingKeys.get(pkcs8B64)
  if (!key) {
    key = crypto.subtle.importKey('pkcs8', b64Decode(pkcs8B64) as BufferSource, { name: 'Ed25519' }, false, ['sign'])
    signingKeys.set(pkcs8B64, key)
  }
  return key
}

export async function ed25519Sign(pkcs8B64: string, message: Uint8Array): Promise<Uint8Array> {
  const sig = await crypto.subtle.sign({ name: 'Ed25519' }, await importSigningKey(pkcs8B64), message as BufferSource)
  return new Uint8Array(sig)
}

/** Verifies a signature made by an app installation's device key (raw 32-byte public key, base64url). */
export async function ed25519Verify(publicKeyB64url: string, signature: Uint8Array, message: Uint8Array): Promise<boolean> {
  try {
    const raw = b64urlDecode(publicKeyB64url)
    if (raw.length !== 32 || signature.length !== 64) return false
    const key = await crypto.subtle.importKey('raw', raw as BufferSource, { name: 'Ed25519' }, false, ['verify'])
    return await crypto.subtle.verify({ name: 'Ed25519' }, key, signature as BufferSource, message as BufferSource)
  } catch {
    return false
  }
}
