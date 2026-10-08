/// <reference types="vite/client" />

declare const __APP_VERSION__: string

interface ImportMetaEnv {
  /** Licensing API base URL, e.g. https://studex.ph/api */
  readonly VITE_LICENSE_API_URL?: string
  readonly VITE_STORE_URL?: string
  readonly VITE_SUPPORT_EMAIL?: string
  /** Development licensing server's public key; ignored in production builds. */
  readonly VITE_LICENSE_DEV_PUBLIC_KEY?: string
  readonly VITE_LICENSE_DEV_KID?: string
  /** "1" skips the license screens in `npm run dev` only. */
  readonly VITE_LICENSE_BYPASS?: string
}
