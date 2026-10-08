/**
 * Money is stored as integer hundredths ("minor units") so totals never pick up
 * floating-point drift. ₱85.50 is stored as 8550.
 */
export type Minor = number

export const CURRENCIES = [
  { code: 'PHP', name: 'Philippine peso' },
  { code: 'USD', name: 'US dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British pound' },
  { code: 'INR', name: 'Indian rupee' },
  { code: 'IDR', name: 'Indonesian rupiah' },
  { code: 'MYR', name: 'Malaysian ringgit' },
  { code: 'SGD', name: 'Singapore dollar' },
  { code: 'THB', name: 'Thai baht' },
  { code: 'VND', name: 'Vietnamese dong' },
  { code: 'JPY', name: 'Japanese yen' },
  { code: 'KRW', name: 'South Korean won' },
  { code: 'CNY', name: 'Chinese yuan' },
  { code: 'AUD', name: 'Australian dollar' },
  { code: 'CAD', name: 'Canadian dollar' },
  { code: 'NZD', name: 'New Zealand dollar' },
  { code: 'AED', name: 'UAE dirham' },
  { code: 'NGN', name: 'Nigerian naira' },
  { code: 'BRL', name: 'Brazilian real' },
  { code: 'MXN', name: 'Mexican peso' },
] as const

const REGION_CURRENCY: Record<string, string> = {
  PH: 'PHP', US: 'USD', GB: 'GBP', IN: 'INR', ID: 'IDR', MY: 'MYR', SG: 'SGD', TH: 'THB',
  VN: 'VND', JP: 'JPY', KR: 'KRW', CN: 'CNY', AU: 'AUD', CA: 'CAD', NZ: 'NZD', AE: 'AED',
  NG: 'NGN', BR: 'BRL', MX: 'MXN', DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR', IE: 'EUR',
}

export function guessCurrency(): string {
  try {
    const region = new Intl.Locale(navigator.language).maximize().region
    if (region && REGION_CURRENCY[region]) return REGION_CURRENCY[region]
  } catch {
    // fall through to the default
  }
  return 'PHP'
}

const formatters = new Map<string, Intl.NumberFormat>()

function formatter(currency: string, fractionDigits: 0 | 2): Intl.NumberFormat {
  const key = `${currency}:${fractionDigits}`
  let f = formatters.get(key)
  if (!f) {
    try {
      f = new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
        currencyDisplay: 'narrowSymbol',
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      })
    } catch {
      f = new Intl.NumberFormat(undefined, {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      })
    }
    formatters.set(key, f)
  }
  return f
}

/** "₱1,180" for whole amounts, "₱85.50" when there are cents. */
export function formatMoney(minor: Minor, currency: string, opts: { signed?: boolean } = {}): string {
  const abs = Math.abs(minor)
  const digits = abs % 100 === 0 ? 0 : 2
  const text = formatter(currency, digits).format(abs / 100)
  if (minor < 0) return `−${text}`
  if (opts.signed && minor > 0) return `+${text}`
  return text
}

export function currencySymbol(currency: string): string {
  try {
    const part = formatter(currency, 0)
      .formatToParts(0)
      .find((p) => p.type === 'currency')
    return part?.value ?? currency
  } catch {
    return currency
  }
}

/**
 * Parse user input such as "85", "1,180.5" or "2 000" into minor units.
 * Returns null for anything that is not a non-negative amount with at most 2 decimals.
 */
export function parseMoney(input: string): Minor | null {
  // \s also matches no-break spaces used as thousands separators in some locales.
  const cleaned = input.replace(/[\s,]/g, '')
  if (!/^(\d+(\.\d{0,2})?|\.\d{1,2})$/.test(cleaned)) return null
  const [whole = '', frac = ''] = cleaned.split('.')
  const minor = Number(whole || '0') * 100 + Number(frac.padEnd(2, '0'))
  return Number.isSafeInteger(minor) ? minor : null
}

/** Minor units back to an editable string: 8550 → "85.50", 200000 → "2000". */
export function minorToInput(minor: Minor): string {
  return minor % 100 === 0 ? String(minor / 100) : (minor / 100).toFixed(2)
}
