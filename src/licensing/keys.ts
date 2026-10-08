/**
 * Public keys that sign Studex entitlements, by key id. Public keys are safe to ship in the app:
 * they can only check signatures, never make them. The private keys stay on the licensing
 * server. To rotate, generate a new pair (`npm run keys` in server/), add its public key here,
 * ship the update, then switch the server's LICENSE_SIGNING_KID. Keep old keys listed so
 * entitlements already on phones stay valid.
 */
export const PRODUCTION_PUBLIC_KEYS: Record<string, string> = {
  // prod1: '<base64url public key from `npm run keys -- prod1`>',
}

/**
 * A development server's key (from .env.development) is accepted only in non-production builds,
 * so an entitlement minted by a dev server can never unlock a release APK.
 */
const devKey: Record<string, string> =
  import.meta.env.MODE !== 'production' && import.meta.env.VITE_LICENSE_DEV_PUBLIC_KEY
    ? { [import.meta.env.VITE_LICENSE_DEV_KID ?? 'dev1']: import.meta.env.VITE_LICENSE_DEV_PUBLIC_KEY }
    : {}

export const LICENSE_PUBLIC_KEYS: Record<string, string> = { ...devKey, ...PRODUCTION_PUBLIC_KEYS }

/** The licensing API, e.g. https://studex.ph/api. Only used to activate, restore or move a license. */
export const LICENSE_API_URL: string = import.meta.env.VITE_LICENSE_API_URL ?? 'https://studex.example/api'

/** Where customers buy Studex and find help. */
export const STORE_URL: string = import.meta.env.VITE_STORE_URL ?? 'https://studex.example'
export const SUPPORT_EMAIL: string = import.meta.env.VITE_SUPPORT_EMAIL ?? 'support@studex.example'
