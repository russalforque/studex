import { b64urlDecode, fromUtf8, utf8 } from './crypto'
import type { Env } from './env'

/**
 * /admin sits behind Cloudflare Access (single sign-on with MFA, free for small teams). Access
 * blocks anyone who isn't allowed before the request reaches the Worker; the Worker then
 * verifies the signed Access JWT itself and checks the email against ADMIN_EMAILS, so a
 * misconfigured Access policy alone can't open the admin.
 */

interface Jwk {
  kid: string
  kty: string
  n: string
  e: string
  alg?: string
}

let jwksCache: { team: string; keys: Jwk[]; fetchedAt: number } | null = null

async function accessKeys(team: string, force = false): Promise<Jwk[]> {
  if (!force && jwksCache && jwksCache.team === team && Date.now() - jwksCache.fetchedAt < 3600_000) return jwksCache.keys
  const res = await fetch(`https://${team}/cdn-cgi/access/certs`)
  if (!res.ok) throw new Error(`Access certs ${res.status}`)
  const { keys } = (await res.json()) as { keys: Jwk[] }
  jwksCache = { team, keys, fetchedAt: Date.now() }
  return keys
}

export async function verifyAccessJwt(token: string, team: string, aud: string, nowSeconds = Math.floor(Date.now() / 1000)): Promise<string | null> {
  const [h, p, s] = token.split('.')
  if (!h || !p || !s) return null
  let header: { kid?: string; alg?: string }
  let payload: { aud?: string | string[]; exp?: number; nbf?: number; iss?: string; email?: string }
  try {
    header = JSON.parse(fromUtf8(b64urlDecode(h)))
    payload = JSON.parse(fromUtf8(b64urlDecode(p)))
  } catch {
    return null
  }
  if (header.alg !== 'RS256' || !header.kid) return null
  let jwk = (await accessKeys(team)).find((k) => k.kid === header.kid)
  if (!jwk) jwk = (await accessKeys(team, true)).find((k) => k.kid === header.kid)
  if (!jwk) return null
  const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, [
    'verify',
  ])
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlDecode(s) as BufferSource, utf8(`${h}.${p}`) as BufferSource)
  if (!ok) return null
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
  if (!auds.includes(aud)) return null
  if (payload.iss !== `https://${team}`) return null
  if (!payload.exp || payload.exp < nowSeconds) return null
  if (payload.nbf && payload.nbf > nowSeconds + 60) return null
  return payload.email?.toLowerCase() ?? null
}

/** The signed-in admin's email, or null. */
export async function adminEmail(env: Env, request: Request): Promise<string | null> {
  const allowed = env.ADMIN_EMAILS.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
  if (env.ENVIRONMENT === 'development' && env.ADMIN_DEV_EMAIL) {
    const dev = env.ADMIN_DEV_EMAIL.toLowerCase()
    return allowed.includes(dev) ? dev : null
  }
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return null
  const token = request.headers.get('cf-access-jwt-assertion')
  if (!token) return null
  try {
    const email = await verifyAccessJwt(token, env.ACCESS_TEAM_DOMAIN, env.ACCESS_AUD)
    return email && allowed.includes(email) ? email : null
  } catch (err) {
    console.error('Access JWT check failed', err)
    return null
  }
}
