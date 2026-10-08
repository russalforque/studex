import { beforeEach, describe, expect, it, vi } from 'vitest'

// The secure store is native; an in-memory stand-in exercises the same calls.
const store = new Map<string, string>()
vi.mock('@aparajita/capacitor-secure-storage', () => ({
  SecureStorage: {
    getItem: async (k: string) => store.get(k) ?? null,
    setItem: async (k: string, v: string) => void store.set(k, v),
    removeItem: async (k: string) => void store.delete(k),
  },
}))
vi.mock('@aparajita/capacitor-biometric-auth', () => ({ BiometricAuth: {}, BiometryType: {} }))
vi.mock('@capacitor-community/privacy-screen', () => ({ PrivacyScreen: { enable: async () => undefined, disable: async () => undefined } }))
vi.mock('./platform', () => ({ isNative: true }))

const lock = await import('./appLock')

beforeEach(() => store.clear())

describe('app lock', () => {
  it('stores only a salted hash, never the PIN', async () => {
    await lock.setPin('482913', false)
    const raw = [...store.values()].join('')
    expect(raw).not.toContain('482913')
    const cfg = (await lock.readLock())!
    expect(cfg).toMatchObject({ length: 6, biometrics: false, failures: 0 })
    expect(cfg.salt).not.toBe('')

    // The same PIN set again gets a different salt and hash.
    await lock.setPin('482913', false)
    expect((await lock.readLock())!.hash).not.toBe(cfg.hash)
  })

  it('accepts the right PIN and rejects others', async () => {
    await lock.setPin('1234', true)
    expect(await lock.checkPin('1234')).toEqual({ ok: true })
    expect((await lock.checkPin('4321')).ok).toBe(false)
  })

  it('makes the student wait after repeated wrong tries, and refuses to check meanwhile', async () => {
    await lock.setPin('1234', false)
    const t = 1_000_000
    for (let i = 0; i < 4; i++) expect(await lock.checkPin('0000', t)).toMatchObject({ ok: false, retryAt: t })
    const fifth = await lock.checkPin('0000', t)
    expect(fifth).toMatchObject({ ok: false, failures: 5, retryAt: t + 30_000 })
    // Even the right PIN isn't checked until the wait is over.
    expect((await lock.checkPin('1234', t + 10_000)).ok).toBe(false)
    expect(await lock.checkPin('1234', t + 30_000)).toEqual({ ok: true })
    expect((await lock.readLock())!.failures).toBe(0)
  })

  it('validates PIN length and turns off cleanly', async () => {
    expect(lock.validPin('123')).toBe(false)
    expect(lock.validPin('12a4')).toBe(false)
    expect(lock.validPin('123456789')).toBe(false)
    await expect(lock.setPin('12', false)).rejects.toThrow()
    await lock.setPin('1234', false)
    await lock.clearLock()
    expect(await lock.readLock()).toBeNull()
    expect(await lock.checkPin('anything')).toEqual({ ok: true })
  })

  it('grows the wait with more wrong tries', () => {
    expect([4, 5, 6, 7, 8, 20].map(lock.lockoutMs)).toEqual([0, 30_000, 60_000, 300_000, 900_000, 900_000])
  })
})
