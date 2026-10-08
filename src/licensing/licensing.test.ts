import { beforeAll, describe, expect, it } from 'vitest'
import { getPublicKeyAsync, utils } from '@noble/ed25519'
// The real server signer, so this also proves the app and the server agree on the format.
import { signEntitlement, type EntitlementClaims as ServerClaims } from '../../server/src/entitlement'
import { generateCode } from '../../server/src/licenseCode'
import { formatCodeInput, maskedCode, normalizeCode } from './code'
import { sha256Hex, verifyEntitlement } from './entitlement'

const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const b64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b)))
const fromB64url = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)))
const textB64url = (s: string) => b64url(new TextEncoder().encode(s))

let serverKey: string
let keys: Record<string, string>
const device = { installationId: '6f1c1e0e-2b7a-4c55-9a59-0e0d5b8d2f41', devicePublicKey: '' }

async function claims(overrides: Partial<ServerClaims> = {}): Promise<ServerClaims> {
  return {
    v: 1,
    aud: 'com.studex.app',
    kid: 'k1',
    lic: 'lic_abc',
    hint: 'K7QF',
    act: 'act_abc',
    ins: device.installationId,
    dk: (await sha256Hex(device.devicePublicKey)).slice(0, 32),
    ed: 'lifetime',
    ch: 'web_android',
    iat: 1_790_000_000,
    ...overrides,
  }
}

beforeAll(async () => {
  const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair
  serverKey = b64(await crypto.subtle.exportKey('pkcs8', pair.privateKey))
  keys = { k1: b64url(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))) }
  device.devicePublicKey = b64url(await getPublicKeyAsync(utils.randomSecretKey()))
})

describe('offline entitlement verification', () => {
  it('accepts an entitlement signed by the server for this installation', async () => {
    const token = await signEntitlement(serverKey, await claims())
    const res = await verifyEntitlement(token, keys, device)
    expect(res).toMatchObject({ ok: true, claims: { lic: 'lic_abc', hint: 'K7QF' } })
  })

  it('rejects a modified payload', async () => {
    const token = await signEntitlement(serverKey, await claims())
    const [p, c, s] = token.split('.')
    const edited = JSON.parse(fromB64url(c!))
    edited.ed = 'lifetime'
    edited.lic = 'lic_someone_else'
    const forged = `${p}.${textB64url(JSON.stringify(edited))}.${s}`
    expect(await verifyEntitlement(forged, keys, device)).toEqual({ ok: false, reason: 'bad_signature' })
  })

  it('rejects an entitlement forged with another key, even if it claims a known key id', async () => {
    const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair
    const attacker = b64(await crypto.subtle.exportKey('pkcs8', pair.privateKey))
    const forged = await signEntitlement(attacker, await claims())
    expect(await verifyEntitlement(forged, keys, device)).toEqual({ ok: false, reason: 'bad_signature' })
  })

  it('rejects unknown key ids, wrong apps and garbage', async () => {
    expect(await verifyEntitlement(await signEntitlement(serverKey, await claims({ kid: 'nope' })), keys, device)).toEqual({ ok: false, reason: 'unknown_key' })
    expect(await verifyEntitlement(await signEntitlement(serverKey, { ...(await claims()), aud: 'com.other' as 'com.studex.app' }), keys, device)).toEqual({
      ok: false,
      reason: 'wrong_app',
    })
    for (const junk of ['', 'STX1', 'STX1.a.b', 'JWT.e30.e30', 'STX1.!!!.???', `STX1.${b64url(new TextEncoder().encode('{"kid":"__proto__"}'))}.AA`]) {
      expect((await verifyEntitlement(junk, keys, device)).ok).toBe(false)
    }
  })

  it('rejects an entitlement copied from another installation', async () => {
    const token = await signEntitlement(serverKey, await claims())
    expect(await verifyEntitlement(token, keys, { ...device, installationId: '00000000-0000-4000-8000-000000000000' })).toEqual({ ok: false, reason: 'other_device' })
    const otherKey = b64url(await getPublicKeyAsync(utils.randomSecretKey()))
    expect(await verifyEntitlement(token, keys, { ...device, devicePublicKey: otherKey })).toEqual({ ok: false, reason: 'other_device' })
  })

  it('has no expiry: an old entitlement still verifies offline', async () => {
    const token = await signEntitlement(serverKey, await claims({ iat: 1_000_000_000 }))
    expect((await verifyEntitlement(token, keys, device)).ok).toBe(true)
  })
})

describe('license code input', () => {
  it('accepts server-generated codes however they are typed, and rejects typos', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateCode()
      expect(normalizeCode(code)).not.toBeNull()
      expect(normalizeCode(code.toLowerCase().replace(/-/g, ''))).not.toBeNull()
      expect(formatCodeInput(code.toLowerCase().replace(/-/g, ' '))).toBe(code)
    }
    expect(normalizeCode('STDX-AAAA-AAAA-AAAA-AAAB')).toBeNull()
    expect(normalizeCode('hello')).toBeNull()
    expect(maskedCode('K7QF')).toBe('STDX-••••-••••-••••-K7QF')
  })
})
