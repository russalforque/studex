import { webcrypto } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { signedMessage } from '../src/activation'
import { b64urlDecode, fromUtf8 } from '../src/crypto'
import { checkChar, generateCode, normalizeCode } from '../src/licenseCode'
import { buy, makeDevice, type TestKit, makeKit } from './helpers'

let kit: TestKit
beforeEach(async () => {
  kit = await makeKit()
})

type Device = Awaited<ReturnType<typeof makeDevice>>

const activate = (code: string, d: Device, ip?: string) => kit.request('/api/activate', { method: 'POST', json: { code, ...d.info }, ...(ip ? { ip } : {}) })

async function verifyEntitlement(token: string) {
  const [prefix, claims, sig] = token.split('.')
  const ok = await webcrypto.subtle.verify({ name: 'Ed25519' }, kit.publicKey, b64urlDecode(sig!), new TextEncoder().encode(`${prefix}.${claims}`))
  return { ok, claims: JSON.parse(fromUtf8(b64urlDecode(claims!))) }
}

async function restoreCode(email: string) {
  await kit.request('/api/restore/start', { method: 'POST', json: { email } })
  return kit.emails.findLast((m) => m.to === email && /verification code/.test(m.subject))!.subject.slice(0, 6)
}

describe('license codes', () => {
  it('are well-formed, unique, checksummed and tolerant of how people type them', () => {
    const codes = new Set(Array.from({ length: 2000 }, generateCode))
    expect(codes.size).toBe(2000)
    const code = [...codes][0]!
    expect(code).toMatch(/^STDX(-[0-9A-HJKMNP-TV-Z]{4}){4}$/)
    expect(normalizeCode(code.toLowerCase().replace(/-/g, ' '))).toBe(code.replace(/^STDX-/, '').replace(/-/g, ''))
    const body = code.replace(/^STDX-/, '').replace(/-/g, '')
    const typo = body.slice(0, 3) + (body[3] === 'A' ? 'B' : 'A') + body.slice(4)
    expect(normalizeCode(typo)).toBeNull()
    expect(checkChar(body.slice(0, 15))).toBe(body[15])
  })
})

describe('activation', () => {
  it('activates with a valid code and returns an entitlement signed for this installation', async () => {
    const { code } = await buy(kit)
    const phone = await makeDevice()
    const res = await activate(code, phone)
    expect(res.status).toBe(200)
    const { entitlement } = await res.json()
    const { ok, claims } = await verifyEntitlement(entitlement)
    expect(ok).toBe(true)
    expect(claims).toMatchObject({ v: 1, aud: 'com.studex.app', kid: 'test1', ins: phone.info.installationId, ed: 'lifetime', ch: 'web_android' })
    expect(claims.hint).toBe(code.slice(-4))
    expect(JSON.stringify(claims)).not.toContain(code.slice(5, 9)) // no secret code in the entitlement
  })

  it('detects a tampered entitlement', async () => {
    const { code } = await buy(kit)
    const { entitlement } = await (await activate(code, await makeDevice())).json()
    const [p, c, s] = entitlement.split('.')
    const claims = JSON.parse(fromUtf8(b64urlDecode(c)))
    claims.ins = webcrypto.randomUUID()
    const forged = `${p}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.${s}`
    expect((await verifyEntitlement(forged)).ok).toBe(false)
  })

  it('is idempotent for the same installation', async () => {
    const { code } = await buy(kit)
    const phone = await makeDevice()
    await activate(code, phone)
    expect((await activate(code, phone)).status).toBe(200)
    expect((await kit.env.DB.prepare(`SELECT COUNT(*) AS n FROM activations WHERE status = 'active'`).first<{ n: number }>())!.n).toBe(1)
  })

  it('rejects invalid and malformed codes, and rate-limits guessing', async () => {
    await buy(kit)
    const phone = await makeDevice()
    expect((await (await activate('STDX-0000', phone)).json()).code).toBe('invalid_code')
    let last: Response | null = null
    for (let i = 0; i < 10; i++) last = await activate(generateCode(), phone, '198.51.100.9')
    expect(last!.status).toBe(429)
    expect(last!.headers.get('retry-after')).toBeTruthy()
  })

  it('rejects requests with an invalid device description', async () => {
    const { code } = await buy(kit)
    const res = await kit.request('/api/activate', { method: 'POST', json: { code, installationId: 'x', devicePublicKey: 'y', platform: 'android' } })
    expect(res.status).toBe(400)
  })

  it('enforces one device per license and recognises a reinstall on the same phone', async () => {
    const { code } = await buy(kit)
    const phone = await makeDevice({ hint: 'samephonehint' })
    expect((await activate(code, phone)).status).toBe(200)

    const other = await makeDevice()
    const blocked = await activate(code, other)
    expect(blocked.status).toBe(409)
    const body = await blocked.json()
    expect(body.code).toBe('device_limit')
    expect(body.devices[0].label).toBe('Pixel 7 · Android 15')

    // Reinstall: new installation id and key, same hashed device id.
    const reinstall = await makeDevice({ hint: 'samephonehint' })
    expect((await activate(code, reinstall)).status).toBe(200)
    const rows = (await kit.env.DB.prepare('SELECT status, end_reason FROM activations ORDER BY created_at').all<{ status: string; end_reason: string }>()).results
    expect(rows.map((r) => r.status).sort()).toEqual(['active', 'replaced'])
  })

  it('refuses revoked licenses', async () => {
    const { code } = await buy(kit)
    await kit.env.DB.prepare(`UPDATE licenses SET status = 'revoked', status_reason = 'refunded'`).run()
    const res = await activate(code, await makeDevice())
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('license_inactive')
  })
})

describe('restore purchase by email', () => {
  it('sends a code only to the purchase address and gives the same answer for unknown emails', async () => {
    await buy(kit, 'owner@example.com')
    const a = await kit.request('/api/restore/start', { method: 'POST', json: { email: 'owner@example.com' } })
    const b = await kit.request('/api/restore/start', { method: 'POST', json: { email: 'stranger@example.com' } })
    expect(a.status).toBe(202)
    expect(b.status).toBe(202)
    expect(await a.json()).toEqual(await b.json())
    expect(kit.emails.filter((m) => m.to === 'stranger@example.com')).toHaveLength(0)
  })

  it('activates a new installation after a reinstall, without the license code', async () => {
    await buy(kit, 'owner@example.com')
    const phone = await makeDevice()
    const code = await restoreCode('owner@example.com')
    const res = await kit.request('/api/restore/verify', { method: 'POST', json: { email: 'owner@example.com', code, ...phone.info } })
    expect(res.status).toBe(200)
    expect((await verifyEntitlement((await res.json()).entitlement)).ok).toBe(true)
  })

  it('moves the license to a replacement phone without the old one, after confirmation', async () => {
    const { code: licenseCode } = await buy(kit, 'owner@example.com')
    await activate(licenseCode, await makeDevice({ label: 'Lost phone' }))
    const newPhone = await makeDevice({ label: 'New phone' })
    const otp = await restoreCode('owner@example.com')

    const first = await kit.request('/api/restore/verify', { method: 'POST', json: { email: 'owner@example.com', code: otp, ...newPhone.info } })
    expect(first.status).toBe(409)
    expect((await first.json()).devices[0].label).toBe('Lost phone')

    const moved = await kit.request('/api/restore/verify', { method: 'POST', json: { email: 'owner@example.com', code: otp, transfer: true, ...newPhone.info } })
    expect(moved.status).toBe(200)
    expect(kit.emails.some((m) => m.subject === 'Studex was activated on a new device')).toBe(true)
    // The code was used up.
    const again = await kit.request('/api/restore/verify', { method: 'POST', json: { email: 'owner@example.com', code: otp, ...newPhone.info } })
    expect((await again.json()).code).toBe('code_expired')
  })

  it('a license code alone cannot take a seat from another phone', async () => {
    const { code } = await buy(kit)
    await activate(code, await makeDevice())
    const res = await kit.request('/api/activate', { method: 'POST', json: { code, transfer: true, ...(await makeDevice()).info } })
    expect((await res.json()).code).toBe('device_limit')
  })

  it('limits self-service moves per year and queues the next one for the admin', async () => {
    const { code } = await buy(kit, 'owner@example.com')
    await activate(code, await makeDevice())
    for (let i = 0; i < 3; i++) {
      const otp = await restoreCode('owner@example.com')
      // Each restore/start is rate-limited per address; move the clock window by clearing counters.
      await kit.env.DB.prepare('DELETE FROM rate_limits').run()
      const res = await kit.request('/api/restore/verify', { method: 'POST', json: { email: 'owner@example.com', code: otp, transfer: true, ...(await makeDevice()).info } })
      expect(res.status).toBe(200)
    }
    const otp = await restoreCode('owner@example.com')
    const res = await kit.request('/api/restore/verify', { method: 'POST', json: { email: 'owner@example.com', code: otp, transfer: true, ...(await makeDevice()).info } })
    expect((await res.json()).code).toBe('transfer_limit')
    expect((await kit.env.DB.prepare(`SELECT COUNT(*) AS n FROM transfer_requests WHERE status = 'open'`).first<{ n: number }>())!.n).toBe(1)
  })

  it('locks a code after five wrong tries', async () => {
    await buy(kit, 'owner@example.com')
    const real = await restoreCode('owner@example.com')
    const phone = await makeDevice()
    const wrong = real === '000000' ? '111111' : '000000'
    for (let i = 0; i < 5; i++) await kit.request('/api/restore/verify', { method: 'POST', json: { email: 'owner@example.com', code: wrong, ...phone.info } })
    const res = await kit.request('/api/restore/verify', { method: 'POST', json: { email: 'owner@example.com', code: real, ...phone.info } })
    expect(res.status).toBe(400)
  })
})

describe('signed device requests', () => {
  it('deactivates only with the device key, freeing the seat for another phone', async () => {
    const { code } = await buy(kit)
    const phone = await makeDevice()
    const { entitlement } = await (await activate(code, phone)).json()
    const { claims } = await verifyEntitlement(entitlement)
    const ts = Math.floor(Date.now() / 1000)

    const intruder = await makeDevice()
    const forged = await kit.request('/api/deactivate', {
      method: 'POST',
      json: { activationId: claims.act, installationId: phone.info.installationId, timestamp: ts, signature: await intruder.sign(signedMessage('deactivate', claims.act, phone.info.installationId, ts)) },
    })
    expect(forged.status).toBe(401)

    const real = await kit.request('/api/deactivate', {
      method: 'POST',
      json: { activationId: claims.act, installationId: phone.info.installationId, timestamp: ts, signature: await phone.sign(signedMessage('deactivate', claims.act, phone.info.installationId, ts)) },
    })
    expect(real.status).toBe(200)
    expect((await activate(code, await makeDevice())).status).toBe(200)

    const status = await kit.request('/api/status', {
      method: 'POST',
      json: { activationId: claims.act, installationId: phone.info.installationId, timestamp: ts, signature: await phone.sign(signedMessage('status', claims.act, phone.info.installationId, ts)) },
    })
    expect(await status.json()).toMatchObject({ activation: 'deactivated', license: 'active' })
  })
})

describe('lost license code', () => {
  it('emails a one-time link that issues a new code and disables the old one', async () => {
    const { code: old } = await buy(kit, 'owner@example.com')
    const phone = await makeDevice()
    await activate(old, phone)
    await kit.request('/api/license/resend', { method: 'POST', json: { email: 'owner@example.com' } })
    const token = kit.emails.findLast((m) => m.subject === 'Get a new Studex license code')!.text.match(/#t=([\w-]+)/)![1]

    const res = await kit.request('/api/license/reissue', { method: 'POST', json: { token } })
    const { licenseCode } = await res.json()
    expect(licenseCode).toMatch(/^STDX/)
    expect(licenseCode).not.toBe(old)
    expect((await kit.request('/api/license/reissue', { method: 'POST', json: { token } })).status).toBe(400)
    expect((await (await activate(old, await makeDevice())).json()).code).toBe('invalid_code')
    // The phone already using Studex is unaffected and the new code works for it.
    expect((await activate(licenseCode, phone)).status).toBe(200)
  })
})

describe('downloads', () => {
  it('serves the current APK to purchasers only', async () => {
    const { successToken } = await buy(kit)
    const order = await (await kit.request(`/api/order?t=${successToken}`)).json()
    const path = new URL(order.downloadUrl).pathname + new URL(order.downloadUrl).search
    expect((await kit.request(path)).status).toBe(503) // no release yet

    await kit.env.RELEASES.put('android/studex-1.0.0-1.apk', new Uint8Array([1, 2, 3]))
    await kit.env.DB.prepare(
      `INSERT INTO releases (version_code, version_name, r2_key, sha256, size_bytes, min_android, published_at, is_current) VALUES (1, '1.0.0', 'android/studex-1.0.0-1.apk', 'abc', 3, 'Android 7.0', 0, 1)`,
    ).run()
    const ok = await kit.request(path)
    expect(ok.status).toBe(200)
    expect(ok.headers.get('content-type')).toBe('application/vnd.android.package-archive')
    expect((await kit.request('/download/android?d=bogus.token')).status).toBe(403)
  })
})

describe('admin', () => {
  it('is invisible without a verified admin identity', async () => {
    expect((await kit.request('/admin')).status).toBe(404)
    expect((await kit.request('/admin', { headers: { 'cf-access-jwt-assertion': 'a.b.c' } })).status).toBe(404)
    expect((await kit.request('/admin/settings', { method: 'POST' })).status).toBe(404)
  })

  it('works for the configured admin in development and refuses cross-site posts', async () => {
    kit.env.ENVIRONMENT = 'development'
    kit.env.ADMIN_DEV_EMAIL = 'owner@studex.test'
    await buy(kit)
    const res = await kit.request('/admin')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('juan@example.com')
    const csrf = await kit.request('/admin/settings', { method: 'POST', headers: { origin: 'https://evil.example' }, body: new URLSearchParams({ price_minor: '100' }) })
    expect(csrf.status).toBe(403)
    const ok = await kit.request('/admin/settings', { method: 'POST', headers: { origin: 'https://studex.test' }, body: new URLSearchParams({ price_minor: '24900' }) })
    expect(ok.status).toBe(303)
    expect((await kit.env.DB.prepare(`SELECT value FROM settings WHERE key = 'price_minor'`).first<{ value: string }>())!.value).toBe('24900')
  })
})

describe('CORS', () => {
  it('allows the app WebView origins and nothing else', async () => {
    const ok = await kit.request('/api/product', { method: 'OPTIONS', headers: { origin: 'https://localhost' } })
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://localhost')
    const bad = await kit.request('/api/product', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } })
    expect(bad.status).toBe(403)
  })
})
