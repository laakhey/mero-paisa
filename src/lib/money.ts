/**
 * Money is always stored and computed as an integer number of minor units
 * (cents, paisa, ...) so that sums never accumulate floating point error.
 */

const fractionDigitsCache = new Map<string, number>();

export function fractionDigits(currency: string): number {
  const cached = fractionDigitsCache.get(currency);
  if (cached !== undefined) return cached;
  let digits = 2;
  try {
    digits =
      new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
        .maximumFractionDigits ?? 2;
  } catch {
    digits = 2;
  }
  fractionDigitsCache.set(currency, digits);
  return digits;
}

export function toMajor(minor: number, currency: string): number {
  return minor / 10 ** fractionDigits(currency);
}

/**
 * Parses user input ("1,234.50", "12", ".5") into minor units.
 * Returns null when the input is not a valid non-negative amount.
 */
export function parseAmount(input: string, currency: string): number | null {
  const cleaned = input.replace(/[\s,]/g, '');
  if (!/^\d*\.?\d*$/.test(cleaned) || cleaned === '' || cleaned === '.') return null;
  const digits = fractionDigits(currency);
  const [whole = '0', fraction = ''] = cleaned.split('.');
  if (fraction.length > digits) return null;
  const minor = Number(whole || '0') * 10 ** digits + Number(fraction.padEnd(digits, '0') || '0');
  return Number.isSafeInteger(minor) ? minor : null;
}

/** Plain editable string for an amount, e.g. 123450 -> "1234.50". */
export function toInputString(minor: number, currency: string): string {
  const digits = fractionDigits(currency);
  return (Math.abs(minor) / 10 ** digits).toFixed(digits);
}

export type NumberStyle = 'lakh' | 'international';

/** Currencies whose users normally group digits in lakhs and crores. */
const LAKH_CURRENCIES = new Set(['NPR', 'INR', 'PKR', 'BDT', 'LKR']);

/** Lakh grouping (1,00,000) for South Asian currencies, international (100,000) otherwise. */
export function defaultNumberStyle(currency: string): NumberStyle {
  return LAKH_CURRENCIES.has(currency.toUpperCase()) ? 'lakh' : 'international';
}

type FormatOptions = {
  /** Prefix positive values with "+". */
  signed?: boolean;
  /** Drop the fraction and abbreviate large values (1.2K, 3.4M; 1.2L, 3.4Cr in lakh style). */
  compact?: boolean;
  /** Digit grouping. Lakh style uses Indian-English rules: 1,00,000 and 1,00,00,000. */
  style?: NumberStyle;
  /** Overrides the locale picked by `style` (tests use this for stable output). */
  locale?: string;
};

export function formatMoney(minor: number, currency: string, options: FormatOptions = {}): string {
  const { signed = false, compact = false, style } = options;
  const locale = options.locale ?? (style === 'lakh' ? 'en-IN' : undefined);
  const value = toMajor(minor, currency);
  let text: string;
  try {
    text = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      // "Rs" rather than "NPR"; "$" rather than "US$".
      currencyDisplay: 'narrowSymbol',
      ...(compact ? { notation: 'compact', maximumFractionDigits: 1 } : null),
    }).format(Math.abs(value));
  } catch {
    text = `${currency} ${Math.abs(value).toFixed(fractionDigits(currency))}`;
  }
  if (minor < 0) return `-${text}`;
  return signed && minor > 0 ? `+${text}` : text;
}

/** Share of `part` in `total` as a 0..1 ratio, safe for zero totals. */
export function ratio(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, part / total);
}
