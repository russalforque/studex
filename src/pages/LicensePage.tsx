import { useState } from 'react'
import { BadgeCheck, DatabaseBackup, LifeBuoy, RefreshCw, Smartphone, Unplug } from 'lucide-react'
import { Page } from '@/components/layout/Page'
import { ConfirmSheet } from '@/components/ui/ConfirmSheet'
import { IconCircle, List, Row, Section } from '@/components/ui/display'
import { useToast } from '@/components/ui/Toast'
import { useLicense } from '@/features/license/licenseContext'
import { maskedCode } from '@/licensing/code'
import { STORE_URL, SUPPORT_EMAIL } from '@/licensing/keys'
import { checkStatus, deactivateThisDevice } from '@/licensing/license'
import { errorMessage } from '@/repositories/errors'
import { formatDate, toISODate } from '@/utils/dates'

const CHANNEL: Record<string, string> = {
  web_android: 'Bought on the Studex website',
  app_store: 'Bought on the App Store',
  google_play: 'Bought on Google Play',
}

/** Settings → License & purchase. Shows nothing secret: no license code, no entitlement token. */
export function LicensePage() {
  const { claims, onEnded } = useLicense()
  const toast = useToast()
  const [confirm, setConfirm] = useState(false)
  const [checking, setChecking] = useState(false)

  const activated = claims.iat ? formatDate(toISODate(new Date(claims.iat * 1000)), { day: 'numeric', month: 'long', year: 'numeric' }) : '—'

  const check = async () => {
    setChecking(true)
    try {
      const res = await checkStatus(claims)
      if (res.stillLicensed) {
        toast('Your license is active on this phone')
      } else {
        toast(res.activation === 'replaced' ? 'Studex was moved to another device' : 'This license is no longer active on this phone', 'error')
        onEnded()
      }
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setChecking(false)
    }
  }

  return (
    <Page title="License & purchase" back>
      <Section>
        <div className="card flex items-center gap-4 rounded-[28px] p-4">
          <IconCircle icon={BadgeCheck} tone="mint" />
          <div className="min-w-0">
            <p className="text-headline font-semibold">Studex Lifetime</p>
            <p className="text-subhead text-ink-2">Active on this device · works offline</p>
          </div>
        </div>
      </Section>

      <Section title="Details">
        <dl className="card divide-y divide-line rounded-[28px] px-4">
          {[
            ['License', maskedCode(claims.hint)],
            ['Activated', activated],
            ['Purchase', CHANNEL[claims.ch] ?? 'Studex purchase'],
            ['Updates', 'Included'],
          ].map(([k, v]) => (
            <div key={k} className="flex min-h-13 items-center justify-between gap-4 py-2">
              <dt className="text-subhead text-ink-2">{k}</dt>
              <dd className="text-right text-subhead font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2.5 px-1 text-footnote text-ink-3">
          Your full license code is in your purchase email. If you lose it, you can get a new one at {STORE_URL.replace(/^https?:\/\//, '')}.
        </p>
      </Section>

      <Section title="Devices">
        <List>
          <Row
            onClick={() => void check()}
            leading={<IconCircle icon={RefreshCw} tone="sky" />}
            title={checking ? 'Checking…' : 'Check license status'}
            subtitle="Optional. Studex never checks on its own."
          />
          <Row
            onClick={() => setConfirm(true)}
            leading={<IconCircle icon={Unplug} tone="peach" />}
            title="Remove from this phone"
            subtitle="Frees your license for another device"
          />
        </List>
        <p className="mt-2.5 flex gap-2 px-1 text-footnote text-ink-3">
          <Smartphone className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Lost your phone? On the new one, tap Restore purchase and enter your purchase email. You don't need the old phone.
        </p>
      </Section>

      <Section title="Your data">
        <List>
          <Row to="/settings" leading={<IconCircle icon={DatabaseBackup} tone="lilac" />} title="Back up your data" subtitle="Settings → Data. Your license doesn't include your data." chevron />
        </List>
      </Section>

      <Section title="Help">
        <List>
          <Row
            onClick={() => window.open(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Studex license ${claims.lic}`)}`, '_blank')}
            leading={<IconCircle icon={LifeBuoy} tone="mint" />}
            title="Contact support"
            subtitle={SUPPORT_EMAIL}
          />
        </List>
      </Section>

      <ConfirmSheet
        open={confirm}
        title="Remove Studex from this phone?"
        message="Studex will lock on this phone and your license becomes free for another device. Your classes, notes and money records stay on this phone, untouched; to take them along, make a backup first in Settings → Data. You can activate here again later. This needs an internet connection."
        confirmLabel="Remove from this phone"
        onConfirm={async () => {
          await deactivateThisDevice(claims)
          toast('Studex was removed from this phone')
          onEnded()
        }}
        onClose={() => setConfirm(false)}
      />
    </Page>
  )
}
