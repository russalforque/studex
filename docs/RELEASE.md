# Studex release and deployment runbook

How to set up, deploy and ship Studex Lifetime. The design is described in
[LICENSING.md](LICENSING.md).

## 1. One-time setup

### Accounts

| Account | For | Notes |
|---|---|---|
| Cloudflare (free; Workers Paid US$5/mo recommended) | Website, API, D1, R2, Access | Add your domain to Cloudflare DNS |
| PayMongo | Payments | Needs DTI + BIR 2303 + ID for a sole proprietorship; ~14 business days |
| Resend (free up to 100 emails/day) | License and verification emails | Verify your sending domain (SPF/DKIM) |
| Domain | e.g. `studex.ph` or `getstudex.com` | |
| Android Developer Console (US$25 once) | Developer verification for sideloaded apps | Register `com.studex.app` with your release certificate before PH enforcement (2027) |

### Licensing keys (server)

```bash
cd server
npm install
npm run keys -- prod1     # prints LICENSE_SIGNING_KEY, LICENSE_PEPPER, DATA_KEY and the app public key
```

Store the output in a password manager. Then:

```bash
npx wrangler secret put LICENSE_SIGNING_KEY
npx wrangler secret put LICENSE_PEPPER
npx wrangler secret put DATA_KEY
npx wrangler secret put PAYMONGO_SECRET_KEY        # sk_test_… first, sk_live_… at launch
npx wrangler secret put PAYMONGO_WEBHOOK_SECRET
npx wrangler secret put RESEND_API_KEY
```

Paste the public-key line into `PRODUCTION_PUBLIC_KEYS` in `src/licensing/keys.ts`:

```ts
export const PRODUCTION_PUBLIC_KEYS: Record<string, string> = {
  prod1: '…43 characters…',
}
```

Never change or reuse `LICENSE_PEPPER`: every stored code hash depends on it. Losing it means no
existing license code works, though activated phones keep working. To rotate the signing key, add
`prod2` to the app, ship that update, then set `LICENSE_SIGNING_KID=prod2` and the new secret. Keep
`prod1` in the app forever.

### Cloudflare resources

```bash
npx wrangler d1 create studex-licensing          # copy database_id into wrangler.toml
npx wrangler r2 bucket create studex-releases
npm run db:migrate:remote
```

Edit `[vars]` in `server/wrangler.toml`: `PUBLIC_ORIGIN`, `SUPPORT_EMAIL`, `EMAIL_FROM`,
`ADMIN_EMAILS`, `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `PAYMONGO_LIVEMODE`. Replace
`support@studex.example` in `server/public/*.html` with your support address.

### Admin protection (Cloudflare Access)

Zero Trust → Access → Applications → Self-hosted: domain `<your domain>/admin*`, policy "emails
in" your admin address(es), with MFA through your identity provider (Google account with 2-step
verification is fine). Copy the application's **AUD tag** into `ACCESS_AUD`. The Worker verifies
the Access JWT itself and also requires the email to be in `ADMIN_EMAILS`.

### PayMongo webhook

Dashboard → Developers → Webhooks → add `https://<domain>/webhooks/paymongo` with the events
`checkout_session.payment.paid`, `payment.failed`, `refund.succeeded`, `dispute.created` and
`dispute.resolved`. Create separate endpoints for test and live mode, each with its own secret.

### Android release key (once, ever)

```bash
keytool -genkeypair -keystore studex-release.jks -alias studex -keyalg RSA -keysize 4096 -validity 10000
```

Keep `studex-release.jks` **outside the repository**, with copies in a password manager and on an
offline drive. If this key is lost, no customer can ever update Studex again without uninstalling,
which deletes their data. Then copy `android/keystore.properties.example` to
`android/keystore.properties` (git-ignored) and fill it in. CI can use the `STUDEX_KEYSTORE`,
`STUDEX_KEYSTORE_PASSWORD`, `STUDEX_KEY_ALIAS` and `STUDEX_KEY_PASSWORD` environment variables
instead.

### App environment

Create `.env.production` (no secrets; it is compiled into the app):

```
VITE_LICENSE_API_URL=https://<domain>/api
VITE_STORE_URL=https://<domain>
VITE_SUPPORT_EMAIL=support@<domain>
```

## 2. Local development

```bash
cd server && cp .dev.vars.example .dev.vars    # paste the output of `npm run keys -- dev1`
npm run db:migrate:local && npm run dev         # http://localhost:8787 (emails print to this console)
```

In the app, `.env.development.local` with `VITE_LICENSE_API_URL=http://localhost:8787/api`,
`VITE_LICENSE_DEV_PUBLIC_KEY=<dev1 public key>` and `VITE_LICENSE_DEV_KID=dev1` lets `npm run dev`
activate against the local server. `VITE_LICENSE_BYPASS=1` skips the license screens entirely
(dev server only; stripped from builds). Admin: http://localhost:8787/admin (uses `ADMIN_DEV_EMAIL`).
A PayMongo **test** key in `.dev.vars` plus a tunnel (`cloudflared tunnel --url http://localhost:8787`)
gives you real test-mode checkouts and webhooks.

## 3. Shipping an Android release

1. Bump `version` in `package.json` (e.g. `1.0.0`). Gradle derives `versionName` and
   `versionCode` (`1.0.0` → `10000`) from it. The version must always increase.
2. `npm run release:android`: checks for a production key and an HTTPS API URL, runs the tests,
   builds, syncs, and builds the signed APK at `android/app/build/outputs/apk/release/app-release.apk`.
   (On macOS/Linux run the last step as `./gradlew assembleRelease`.)
3. Test it on a real phone: fresh install → activate; install over the previous release → data
   and activation still there; airplane mode → app opens and works.
4. Publish:
   ```bash
   cd server
   node scripts/publish-release.mjs ../android/app/build/outputs/apk/release/app-release.apk 1.0.0 10000 "First release" --remote
   ```
   It refuses debug-signed APKs, uploads to R2, and records version, size and SHA-256 as the
   current release (shown on the install page).

Never upload a debug APK, and never commit the keystore or `keystore.properties`.

## 4. Deploy the website and backend

```bash
cd server
npm run deploy        # typecheck + tests + wrangler deploy
```

## 5. Go-live checklist

**Business and legal**
- [ ] PayMongo account activated (DTI, BIR 2303, ID, bank account); live payment methods enabled
- [ ] BIR: issue official receipts/invoices for sales as required for your registration
- [ ] Privacy Policy and Terms reviewed and business details filled in (`server/public/privacy.html`, `terms.html`)
- [ ] Support mailbox working; addresses updated on the site and in `.env.production`

**Test mode, end to end, on the deployed site**
- [ ] Buy with each method (QR Ph, GCash, Maya, card) using PayMongo test credentials → success page shows the code; the email arrives
- [ ] Cancel at checkout → cancelled page; no license
- [ ] A dashboard "send test event" returns 200 (confirms the signature format)
- [ ] Refund in the PayMongo dashboard → order refunded and license revoked in `/admin`
- [ ] Download the APK from the email link; the checksum matches the install page
- [ ] Activate on a phone; force-stop; airplane mode; reopen → works offline
- [ ] Uninstall → reinstall → Restore purchase → email code → active again; data restored from a backup
- [ ] Second phone → restore → "Move Studex to this phone?" → works; the first phone shows "moved" after *Check license status*
- [ ] Lost code flow on the website
- [ ] `/admin` is unreachable without Access; reachable with it

**Switch to live**
- [ ] `PAYMONGO_LIVEMODE = "true"`, live secret key and live webhook secret, `npm run deploy`
- [ ] One real ₱199 purchase on your own phone, then refund it

**Ongoing**
- [ ] Check `/admin` → errors and device requests weekly
- [ ] Back up D1 now and then: `npx wrangler d1 export studex-licensing --remote --output backup.sql`

## 6. Running costs

| Item | Cost | Notes |
|---|---|---|
| PayMongo | per sale, no monthly fee | ₱199 sale: QR Ph ~₱2.67, Maya ~₱3.90, GCash ~₱4.44, card ~₱19.61 (VAT-inclusive) |
| Cloudflare Workers + D1 + R2 | US$0 on the free tier; **US$5/month** recommended (Workers Paid) | Free: 100k requests/day, D1 5 GB, R2 10 GB with free egress. One APK is ~18 MB, so 1,000 downloads ≈ 18 GB of egress, which costs nothing on R2. Paid removes the tight per-request CPU limit and daily caps. |
| Cloudflare Access | US$0 | Free for up to 50 users |
| Resend | US$0 up to 3,000/month (100/day) | ~2–3 emails per sale. Above ~40 sales/day, Pro is US$20/month |
| Domain | ~US$10–15/year (.com) or ~₱1,500–2,500/year (.ph) | |
| Android Developer Console | US$25 once | Developer verification for sideloaded apps |
| Apple Developer Program | US$99/year | Only when you ship on iOS |
| BIR/DTI registration and bookkeeping | varies | Business costs, not infrastructure |

**Typical total:** about **US$5/month + domain** (~₱300–350/month), plus the per-sale PayMongo fee.
At ₱199 with QR Ph or e-wallets, two sales a month cover the infrastructure.
