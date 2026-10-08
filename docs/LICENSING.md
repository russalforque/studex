# Studex licensing, payments and distribution

Studex is sold once (₱199 by default, set on the server) from the Studex website, downloaded as an
Android APK, activated once online, and then used offline indefinitely. This document covers the
design, the security model, the trade-offs and the iOS position. The operational runbook
(keys, signing, deploy, costs) is in [RELEASE.md](RELEASE.md).

## 1. Architecture

```
 Customer's browser                    Cloudflare (one Worker: server/)                 PayMongo
 ───────────────────                   ───────────────────────────────                 ────────
 studex website  ──POST /api/checkout──▶ create order (D1) ─────create checkout session──▶ hosted
 (server/public)                                                                          checkout
      ▲  ◀──────────── redirect to checkout.paymongo.com ─────────────────────────────────┘   │
      │                                  ◀──── webhook checkout_session.payment.paid ──────────┤
      │                                  verify HMAC → re-fetch session from API → issue license
      └─ success page polls /api/order ──▶ (also asks PayMongo directly if webhook is late)
                                         email license code + download link (Resend)
                                         /download/android ──▶ APK from R2

 Studex app (Android)                     /api/activate, /api/restore/*, /api/deactivate, /api/status
 ──────────────────                       issue Ed25519-signed entitlement (private key = server secret)
 LicenseGate ── first launch ──HTTPS──▶
            ◀── signed entitlement ───
 every later launch: verify signature + installation offline. No network.
```

Three separate responsibilities:

| Part | Where | Holds |
|---|---|---|
| App | `src/licensing/`, `src/features/license/`, `src/pages/LicensePage.tsx` | Installation identity, device key, the signed entitlement (secure storage). Never payment or customer data. |
| Website | `server/public/` (static, served by the Worker) | Product info, pricing, checkout start, success/cancel pages, recovery, install guide, privacy, terms. |
| Licensing backend | `server/src/` + D1 `studex-licensing` + R2 `studex-releases` | Orders, licenses, activations, webhook events, email challenges, rate limits, audit log, releases. |

The licensing database is completely separate from the student's SQLite database. The app's
license state lives in the Android Keystore / iOS Keychain (via `@aparajita/capacitor-secure-storage`),
not in SQLite and not in backups. `LicenseGate` runs **before** the database is opened, so nothing
in licensing can read, change or delete student data.

**Why Cloudflare Workers + D1 + R2:** one deployable for site, API, webhooks, downloads and admin;
no server to patch; HTTPS by default; free egress for APK downloads; costs ~US$5/month at most.
D1 is SQLite, so every critical write is a single atomic statement or a `batch` (a transaction).

## 2. Payment provider: PayMongo

| | PayMongo | Xendit |
|---|---|---|
| Hosted checkout, PHP | Yes (Checkout Sessions v2) | Yes (Payment Links/Invoices) |
| GCash / Maya / QR Ph | 2.23% / 1.96% / 1.34% | ~2.3% / 1.8% / — |
| Cards | 3.125% + ₱13.39 | 3.2% + ₱10 |
| VAT | Included in PayMongo's rates | Excluded (add 12%) |
| Monthly fee | None | None |

PayMongo was chosen: Philippine-first, QR Ph at 1.34% (the cheapest method for a ₱199 sale), a
signed-webhook model with a documented hosted checkout, and no monthly fee. Rates are from
PayMongo's and Xendit's public pricing pages as of October 2026. Check them again before launch.

**Merchant eligibility. A valid ID alone is not enough.** PayMongo's documented activation
requirements for a **sole proprietorship** are a DTI Certificate of Business Name Registration, the
owner's government ID (1 primary or 2 secondary), and a BIR Certificate of Registration (Form 2303).
Corporations and OPCs need SEC documents as well. Review takes up to ~14 business days. You also need
a bank account for settlement and a website showing the product, price, terms, refund policy and
contact details (the site in `server/public` is built to meet this). Ask PayMongo support whether
they currently onboard individuals without DTI/BIR registration; don't plan on it.

**Fee example (₱199, QR Ph):** 1.34% → ~₱2.67 fee, you net ~₱196.33. By GCash ~₱194.56; by card
~₱179.39.

Payment methods are configured with `PAYMONGO_METHODS` (default `qrph,gcash,paymaya,card`); each must
also be enabled on your PayMongo account.

## 3. Checkout and payment confirmation

1. The browser posts `{email, clientRef}` to `/api/checkout`. `clientRef` is a random id kept in
   `sessionStorage`, so a double-click reuses the same order and the same checkout page.
2. The server creates an `orders` row at the **server-side price**, then a PayMongo Checkout Session
   (with `Idempotency-Key: checkout-<orderId>`), and returns PayMongo's `checkout_url`. The browser
   checks that the URL is on `paymongo.com` before redirecting.
3. The customer pays on PayMongo's hosted page. The secret key never leaves the Worker.
4. **Confirmation never comes from the browser.** Two server-side paths reach `fulfilOrder()`:
   - the webhook `checkout_session.payment.paid`: HMAC signature checked on the raw body, livemode
     checked, event id recorded once, and then **the session is re-fetched from PayMongo's API**
     before anything is issued;
   - the success page polling `/api/order`: while the order is pending, the server asks PayMongo's
     API directly (at most every 5 s). This covers delayed webhooks.
5. `fulfilOrder()` checks that the session matches the order, that livemode matches, that a payment is
   `paid`, and that **amount and currency match the order exactly**. It then inserts the license
   (`licenses.order_id UNIQUE`, `INSERT OR IGNORE`) and marks the order paid in one batch. Only the
   request that actually inserted sends the email, so duplicate webhooks, retries and the success
   page racing the webhook issue exactly one license and one email.

| Situation | Behaviour |
|---|---|
| Payment fails | `payment.failed` is logged. The order stays open because hosted checkout lets the customer try another method. |
| Checkout cancelled | `cancel_url` → `/purchase/cancelled.html`: "No payment was made". The order expires after 48 h. |
| Webhook delayed or lost | The success page confirms with PayMongo's API. A late webhook is a no-op. |
| Duplicate or replayed webhook | `webhook_events.id` primary key: processed once. Effects are idempotent anyway. |
| Forged webhook | Bad signature → 401, logged as `webhook.bad_signature`. |
| Amount mismatch | Not fulfilled; logged as `order.fulfil_rejected`. |
| Full refund (`refund.succeeded`) | Order `refunded`, license `revoked`, activations `revoked`. A partial refund is only logged. |
| Dispute | `dispute.created` → license `suspended`. If the dispute is won, the license is reinstated; if lost, it is revoked. |
| Paid after the order expired | Still honoured (expired orders can be fulfilled). |

Subscribe the webhook to `checkout_session.payment.paid`, `payment.failed`, `refund.succeeded`,
`dispute.created` and `dispute.resolved`.

> **Verify before go-live:** PayMongo's current docs describe the `Paymongo-Signature` header as
> `t=<timestamp>,te=<test sig>,li=<live sig>` with HMAC-SHA256 over `"<t>.<raw body>"`, which is
> what `verifyWebhookSignature` implements. Send a test event from the PayMongo dashboard to your
> test endpoint and confirm it returns 200 (not 401) before going live. Also confirm that refund
> events carry `payment_id`; the refund handler depends on it.

## 4. Licenses

- **Code:** `STDX-XXXX-XXXX-XXXX-XXXX`: 15 random Crockford base32 characters from
  `crypto.getRandomValues` (75 bits), plus a check character so typos are caught before they use up
  an attempt. With the rate limits below, guessing isn't feasible (2^75 codes, ≤ 8 wrong guesses
  per IP per hour).
- **Stored:** only `HMAC-SHA256(LICENSE_PEPPER, code)` plus the last 4 characters for display. A
  database leak doesn't reveal working codes.
- **Shown:** on the success page for 7 days (an AES-GCM-sealed copy, bound to the order id and wiped
  by the daily cron) and in the purchase email. After that, the customer gets a new code through
  recovery.
- **Record:** license id, order id (purchase reference), email (customer reference), created
  (purchase timestamp), status `active|suspended|revoked` + reason, `max_devices`, `edition`
  (`lifetime`), `channel` (`web_android`; `app_store`/`google_play` are reserved for later).

## 5. Offline activation

**Entitlement format:** `STX1.<base64url(JSON claims)>.<base64url(Ed25519 signature)>`

```json
{ "v":1, "aud":"com.studex.app", "kid":"prod1", "lic":"lic_…", "hint":"K7QF", "act":"act_…",
  "ins":"<installation uuid>", "dk":"<sha256(device public key)[:32]>", "ed":"lifetime",
  "ch":"web_android", "iat":1791479015 }
```

- **Ed25519** (RFC 8032). The server signs with Web Crypto. The app verifies with
  `@noble/ed25519` (audited, maintained, no native code; works on old Android WebViews that lack
  Ed25519 in Web Crypto).
- The private key is a Worker secret. The app ships only public keys (`src/licensing/keys.ts`,
  rotatable by `kid`). Dev keys are compiled in only for non-production builds.
- **On every launch, offline:** valid signature from a known key → claims checked (`v`, `aud`, `ed`) →
  `ins` must equal this installation's id and `dk` this installation's device key. A tampered token, a
  token copied to another phone, or one minted without the private key fails. A rejected token
  leaves the student's data untouched; the welcome screen just appears again.
- **Stored in** secure storage (Android Keystore-backed, iOS Keychain), next to the installation id
  and the device private key. There is no `isPremium` flag anywhere; the signature is the boundary.
- **No expiry, no periodic check.** Studex never contacts the server after activation unless the
  student taps *Check license status* or *Remove from this phone*.

### Device identity (privacy)

| Item | What | Why |
|---|---|---|
| Installation id | Random UUID made on first launch | Binds the entitlement to this install |
| Device key | Ed25519 key pair made on first launch; private half never leaves secure storage | Proves deactivate/status requests come from that phone |
| Device hint | `sha256("studex-device-hint:" + app-scoped device id)`; on Android the per-app ANDROID_ID | Recognises a reinstall on the same phone so it isn't counted as a device move |
| Label | Model + OS version, e.g. "Pixel 7 · Android 15" | Lets the customer recognise devices in a list |

No IMEI, serial number, phone number, location or contacts are collected.

### The trade-off, plainly

An entitlement that works offline forever **cannot be withdrawn from a phone that never goes online
again**. A refund, a revocation or a device move takes effect on the server immediately (no new
activations or restores) but on a given phone only when that phone talks to the server: through
*Check license status*, or the next time the license is activated anywhere. If someone shares a code
and then moves the seat, the first phone keeps working until it checks in. This was accepted
deliberately in exchange for no daily checks, no forced re-activation and no dependency on server
uptime. On a device the user fully controls (root, patched APK), any client-side check can be
bypassed; the design aims to make that the only way, and to keep honest customers from ever being
locked out.

## 6. Device policy, replacement and recovery

| Action | How | Verification |
|---|---|---|
| Activate | App → `/api/activate` with the code | Code (rate-limited) |
| Same phone, reinstalled | Code or email; same device hint → old activation replaced | Code or email OTP; not counted as a move |
| New or replacement phone | App → **Restore purchase** → email → 6-digit code → "Move Studex to this phone?" | Email OTP (proves inbox ownership). Old phone not needed. |
| Lost phone | Same as above | Same |
| Remove from this phone | Settings → License & purchase → Remove | Signed with the device key |
| View status | Settings → License & purchase | Local; *Check license status* is optional and signed |
| Lost license code | Website → Recover → emailed one-time link → **new** code (old one disabled; active phones unaffected) | Email link, 30 min, single use |
| More than 3 moves/year | Request queued → admin approves in `/admin` | Manual review |
| Support | `mailto:` from the app and the site | n/a |

A license code alone can never take a seat from another phone; only the verified email owner (or
the admin) can. Knowing someone's email never reveals their license: restore codes and links go only
to that inbox, and `/restore/start` and `/license/resend` give the same answer whether or not a
purchase exists.

**License vs data:** restoring a purchase unlocks Studex; it does not restore classes, notes or money
records. Those come back only from the student's own backup file (Settings → Data). The app,
website, emails and FAQ all say this, and that a lost phone without a backup means lost data.

## 7. Security measures

| Threat | Mitigation |
|---|---|
| Forged payment confirmation | HMAC-verified webhook on the raw body + re-fetch of the session from PayMongo's API + amount/currency/livemode check. The browser redirect proves nothing. |
| Replayed / duplicate webhooks | Event-id table; idempotent fulfilment; 3-day timestamp tolerance |
| Duplicate license issuance | `licenses.order_id UNIQUE` + `INSERT OR IGNORE` in a batch; email only from the inserting request |
| Duplicate payment | `orders.client_ref UNIQUE` (same order for repeated clicks); PayMongo idempotency key |
| Code guessing / brute force | 75-bit codes; per-IP limits (20 activations/h, 8 wrong codes/h) and per-installation limits; `Retry-After` |
| OTP guessing | 6 digits, 5 attempts per code counted atomically before checking, 15-min expiry, only newest code valid, 3 sends/h per address, 6/h per IP |
| Email enumeration | Identical responses for known and unknown emails |
| Unauthorized transfer | Code alone can't move a seat; moves need the email OTP; 3/year self-service, then admin review; email notice on every move |
| Unauthorized deactivation | Requires a signature by the installation's device key (±10 min timestamp) |
| Tampered / forged entitlement | Ed25519 signature + installation binding; private key only on the server |
| Injection | Every query uses bound parameters; admin HTML is escaped; strict CSP on site and admin |
| Exposed credentials | All secrets are Worker secrets; `.dev.vars`, keystores and `keystore.properties` are git-ignored; nothing secret in the APK (`.env.example` says so) |
| Insecure token storage | Entitlement and device key in Keystore/Keychain-backed secure storage; order tokens hashed at rest; reissue token in URL fragment (never sent to servers or Referer) |
| Predictable identifiers | All ids are 128-bit random (`ord_`, `lic_`, `act_`); order access tokens 256-bit |
| Admin abuse | Cloudflare Access (SSO + MFA) in front, JWT verified again in the Worker against `ADMIN_EMAILS`; returns 404 otherwise; Origin check on POST; every admin action audited |
| API abuse | CORS limited to the site and app origins; rate limits on every write endpoint |
| Debug builds to customers | Gradle refuses unsigned release builds; `publish-release.mjs` refuses debug-signed APKs; `check:release` refuses builds without a production key or with a dev/placeholder API URL |

Obfuscation is not relied on (`minifyEnabled false` stays). The protection comes from the signature
and the server-side records.

## 8. Admin (`/admin`)

Dashboard (paid orders, gross revenue, active licenses and devices, open device requests, errors in
the last 24 h), search by email/order/license/payment id, and order detail with license, devices and
full history. Actions: suspend/revoke/reinstate (reason required), free a device seat, change the
device limit, email a new-code link, record a refund (after refunding in PayMongo), approve or
decline device-move requests, and change the price, product name and policy limits. Every action is
written to `audit_log` with the admin's email.

## 9. iOS distribution

Studex stays technically iOS-compatible (the licensing code runs in the iOS WebView; secure storage
uses the Keychain), but **a paid IPA cannot be sold from the Studex website to Philippine
customers**:

- Alternative app marketplaces and web distribution are available only in the **EU** (and in Japan
  through marketplaces under its 2025 law), and require the Apple account region and physical
  location to be there. The Philippines isn't eligible.
- TestFlight is for testing only (90-day builds, invited testers), not for sales.
- Enterprise and ad-hoc distribution aren't allowed for selling to the public.
- External-purchase link entitlements are limited to specific storefronts (e.g. the US after the
  2025 court ruling, plus programmes in the EU, Japan and Korea); the Philippine storefront isn't one
  of them. Unlocking an App Store app from a website purchase, without also offering in-app purchase,
  isn't something to plan on for PH.

**Recommended path:** App Store, either as a **paid upfront app** (simplest, no IAP code) or as a free
download with a **non-consumable in-app purchase** "Studex Lifetime" (allows a preview mode). Both
require the Apple Developer Program (US$99/year), a Mac with Xcode, App Review, and Apple's
commission (15% under the Small Business Program). The backend already models this separately:
`licenses.channel` reserves `app_store` and `google_play`. The IAP route would add a
`/api/apple/verify` endpoint that validates the App Store signed transaction (JWS) server-side and
issues an entitlement with `ch: "app_store"`. Cross-platform recognition (a website purchase
unlocking iOS) is **not** promised anywhere. The website says the iPhone version is "not available
yet" and is sold separately.

| Can be done on Windows | Needs macOS + Xcode |
|---|---|
| All web/TypeScript code, licensing logic and tests, the backend, App Store Connect setup in a browser, IAP product configuration | Building and signing the IPA, running on iPhone/simulator, StoreKit testing, uploading builds, the App Review submission |

## 10. Android distribution

- Release APKs are signed with your release key (v2 + v3 signature schemes; minSdk 24 = Android 7.0).
  The key must never change: Android only installs updates signed with the same key, and a mismatch
  forces an uninstall, which deletes local data. Back it up in two places.
- APKs are served from R2 through `/download/android?d=…`, a per-license link that stops working for
  revoked licenses, with the SHA-256 checksum published on the install page. Hiding the URL is not
  the protection; activation is.
- **Google's developer verification:** since 30 Sept 2026, apps installed outside Play on certified
  Android devices must be registered to a verified developer in Brazil, Indonesia, Singapore and
  Thailand, with global rollout planned for 2027. The Philippines isn't enforced yet, but will be.
  Register in the Android Developer Console now (full distribution account, US$25 one-time,
  government ID) and register `com.studex.app` with your release certificate, so installs keep
  working when enforcement reaches PH.

## 11. Testing

`npm test` (app) and `cd server && npm test` run the suites below; all pass.

| Area | Covered by |
|---|---|
| Webhook signature: valid, tampered body, wrong secret, wrong mode, stale, missing | `server/test/payments.test.ts` |
| Checkout: server price, double-click reuse, bad email, provider outage | 〃 |
| Paid → exactly one license and one email with duplicate/repeated webhooks | 〃 |
| Forged webhook; unpaid-per-API session; amount mismatch; live event in test mode; unknown types; failed payment | 〃 |
| Delayed webhook (success page confirms via API); reveal window; unknown order | 〃 |
| Full vs partial refund; dispute suspend/reinstate | 〃 |
| Code format, uniqueness, checksum | `server/test/licensing.test.ts` |
| Valid activation; tampered entitlement; idempotent re-activation; invalid code; guessing rate limit; bad device data | 〃 |
| One device; reinstall recognised; revoked license refused | 〃 |
| Restore: no enumeration; reinstall restore; replacement phone move with confirmation; code alone can't move; yearly move limit → admin queue; OTP lockout | 〃 |
| Signed deactivate (forgery rejected) frees the seat; signed status | 〃 |
| Lost code → one-time link → new code; old code dead; active phone unaffected | 〃 |
| Downloads for purchasers only; admin hidden without identity; CSRF; settings; CORS | 〃 |
| App verifier accepts the **server's** signatures; rejects modified, forged, unknown-key, wrong-app, other-installation tokens and garbage; no expiry | `src/licensing/licensing.test.ts` |

Also verified by hand on 9 Oct 2026: `wrangler dev` (real Workers runtime + local D1) end to end
(activate → signature valid with the public key → device limit → signed status → signed deactivate
→ seat freed); a signed release APK built and checked with `apksigner`; Gradle refusing an unsigned
release; on an Android 17 emulator, the update installed over an existing debug install, and the
welcome and activate screens and the "server unreachable" error worked.

**Not yet tested (needs your accounts or a device session):** real PayMongo test-mode checkout and
webhook delivery, real email delivery, the offline error on a device (the emulator lost its adb
connection in airplane mode), activation on a device against a deployed HTTPS server, an APK update
over a *release-signed* install, and anything on iOS. These are in the go-live checklist in
[RELEASE.md](RELEASE.md).
