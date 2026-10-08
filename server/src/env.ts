/** Bindings and secrets. Secrets are set with `wrangler secret put`; see .dev.vars.example. */
export interface Env {
  DB: D1Database
  RELEASES: R2Bucket
  ASSETS: Fetcher

  /** "development" turns on the admin dev login and the log-only email provider. */
  ENVIRONMENT: 'development' | 'production'
  /** Public origin of this site, e.g. https://studex.ph. Used in emails and redirect URLs. */
  PUBLIC_ORIGIN: string
  /** Origins allowed to call /api from the app (Capacitor WebViews) besides PUBLIC_ORIGIN. */
  APP_ORIGINS: string
  SUPPORT_EMAIL: string

  // PayMongo
  PAYMONGO_SECRET_KEY: string
  PAYMONGO_WEBHOOK_SECRET: string
  /** "true" in production. Events whose livemode differs are acknowledged and ignored. */
  PAYMONGO_LIVEMODE: string
  /** Comma-separated PayMongo payment method types, e.g. "qrph,gcash,paymaya,card". */
  PAYMONGO_METHODS: string

  // Licensing keys
  /** Ed25519 private key, PKCS#8, base64. Never leaves the server. */
  LICENSE_SIGNING_KEY: string
  /** Key id embedded in entitlements so the app can pick the matching public key. */
  LICENSE_SIGNING_KID: string
  /** 32+ random bytes, base64. Keys the HMACs for license codes, tokens and IP hashes. */
  LICENSE_PEPPER: string
  /** 32 random bytes, base64. AES-GCM key for the short-lived copy of a new license code. */
  DATA_KEY: string

  // Email
  EMAIL_PROVIDER: 'resend' | 'log'
  RESEND_API_KEY?: string
  EMAIL_FROM: string

  // Admin (Cloudflare Access in front of /admin)
  ACCESS_TEAM_DOMAIN?: string
  ACCESS_AUD?: string
  ADMIN_EMAILS: string
  /** Only honoured when ENVIRONMENT is "development". */
  ADMIN_DEV_EMAIL?: string
}
