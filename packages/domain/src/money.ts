/** Money is always an integer number of cents (CLAUDE.md data rules). */
export type Cents = number;

export function assertCents(value: number, label = 'value'): asserts value is Cents {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be an integer number of cents, got ${String(value)}`);
  }
}

export function addCents(a: Cents, b: Cents): Cents {
  assertCents(a, 'a');
  assertCents(b, 'b');
  return a + b;
}

export function subCents(a: Cents, b: Cents): Cents {
  assertCents(a, 'a');
  assertCents(b, 'b');
  return a - b;
}

export function sumCents(values: readonly Cents[]): Cents {
  return values.reduce((total, v) => addCents(total, v), 0);
}

/** `part` as a whole-number percent of `whole` (which must be positive), halves rounded up. */
export function percentOf(part: Cents, whole: Cents): number {
  assertCents(part, 'part');
  assertCents(whole, 'whole');
  if (whole <= 0) throw new RangeError('whole must be greater than zero');
  // Integer math: (part × 200 + whole) ÷ (whole × 2), rounded down.
  return Math.floor((part * 200 + whole) / (whole * 2));
}

const MINUS = '−';

/**
 * `$1,234.56`; with `{ whole: true }` rounded half away from zero to `$1,235`.
 * Negatives use a true minus sign (U+2212); an amount that shows as zero never gets one.
 * Works on the digit string, so no float math touches the cents.
 */
export function formatMoney(value: Cents, options: { whole?: boolean } = {}): string {
  assertCents(value);
  const magnitude = Math.abs(value) + (options.whole ? 50 : 0);
  const digits = String(magnitude).padStart(3, '0');
  const dollars = digits.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const shownCents = options.whole ? '' : `.${digits.slice(-2)}`;
  const isZero = !/[1-9]/.test(options.whole ? digits.slice(0, -2) : digits);
  const sign = value < 0 && !isZero ? MINUS : '';
  return `${sign}$${dollars}${shownCents}`;
}

/** The mean to the nearest cent, halves rounded up; null when there is nothing to average. */
export function averageCents(values: readonly Cents[]): Cents | null {
  if (values.length === 0) return null;
  // Integer math: (sum × 2 + count) ÷ (count × 2), rounded down.
  const total = sumCents(values);
  return Math.floor((total * 2 + values.length) / (values.length * 2));
}
