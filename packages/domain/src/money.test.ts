import { describe, expect, it } from 'vitest';
import { addCents, assertCents, formatMoney, subCents, sumCents, percentOf } from './money';

const MINUS = '−';

describe('formatMoney', () => {
  it('formats cents as US dollars: formatMoney(123456) → $1,234.56', () => {
    expect(formatMoney(123456)).toBe('$1,234.56');
  });

  it('uses a true minus sign: formatMoney(-92300, {whole:true}) → −$923', () => {
    const out = formatMoney(-92300, { whole: true });
    expect(out).toBe(`${MINUS}$923`);
    expect(out.codePointAt(0)).toBe(0x2212);
    expect(out).not.toContain('-');
  });

  it('shows cents for negatives by default', () => {
    expect(formatMoney(-92300)).toBe(`${MINUS}$923.00`);
    expect(formatMoney(-5)).toBe(`${MINUS}$0.05`);
  });

  it('handles zero, sub-dollar and million-dollar amounts', () => {
    expect(formatMoney(0)).toBe('$0.00');
    expect(formatMoney(99)).toBe('$0.99');
    expect(formatMoney(100000000)).toBe('$1,000,000.00');
  });

  it('never prints a minus for zero, including -0', () => {
    expect(formatMoney(-0)).toBe('$0.00');
    expect(formatMoney(-0, { whole: true })).toBe('$0');
  });

  it('whole rounds half away from zero', () => {
    expect(formatMoney(92350, { whole: true })).toBe('$924');
    expect(formatMoney(-92350, { whole: true })).toBe(`${MINUS}$924`);
    expect(formatMoney(92349, { whole: true })).toBe('$923');
    expect(formatMoney(123456, { whole: true })).toBe('$1,235');
  });

  it('whole never prints a minus when the amount rounds to $0', () => {
    expect(formatMoney(-49, { whole: true })).toBe('$0');
    expect(formatMoney(49, { whole: true })).toBe('$0');
  });

  it('rejects non-integer cents', () => {
    expect(() => formatMoney(1.5)).toThrow(RangeError);
  });
});

describe('money helpers reject non-integer cents', () => {
  it.each([1.5, -0.1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'assertCents(%s) throws',
    (bad) => {
      expect(() => assertCents(bad)).toThrow(RangeError);
    },
  );

  it('assertCents accepts integers, including negative and zero', () => {
    expect(() => assertCents(0)).not.toThrow();
    expect(() => assertCents(-92300)).not.toThrow();
  });

  it('assertCents names the offending value in its message', () => {
    expect(() => assertCents(1.5, 'rent_cents')).toThrow(/rent_cents/);
  });

  it('addCents, subCents and sumCents reject non-integer input', () => {
    expect(() => addCents(1, 0.5)).toThrow(RangeError);
    expect(() => addCents(0.5, 1)).toThrow(RangeError);
    expect(() => subCents(1, 0.5)).toThrow(RangeError);
    expect(() => subCents(0.5, 1)).toThrow(RangeError);
    expect(() => sumCents([1, 2.5])).toThrow(RangeError);
  });

  it('addCents, subCents and sumCents do integer arithmetic', () => {
    expect(addCents(100, 250)).toBe(350);
    expect(subCents(100, 250)).toBe(-150);
    expect(sumCents([100, 250, -50])).toBe(300);
    expect(sumCents([])).toBe(0);
  });
});

describe('error messages name the offending argument (mutation-killing)', () => {
  it('assertCents defaults its label to "value"', () => {
    expect(() => assertCents(1.5)).toThrow('value must be an integer number of cents, got 1.5');
  });

  it('addCents, subCents and sumCents name which operand is bad', () => {
    expect(() => addCents(0.5, 1)).toThrow(/^a must be/);
    expect(() => addCents(1, 0.5)).toThrow(/^b must be/);
    expect(() => subCents(0.5, 1)).toThrow(/^a must be/);
    expect(() => subCents(1, 0.5)).toThrow(/^b must be/);
  });
});

describe('P1-12 percentOf', () => {
  it('rounds to the nearest whole percent, halves up', () => {
    expect(percentOf(1, 200)).toBe(1);
    expect(percentOf(1, 201)).toBe(0);
    expect(percentOf(275_000, 600_000)).toBe(46);
  });

  it('needs integer cents and a positive whole', () => {
    expect(() => percentOf(1.5, 100)).toThrow(/part must be an integer/);
    expect(() => percentOf(1, 100.5)).toThrow(/whole must be an integer/);
    expect(() => percentOf(1, 0)).toThrow(/whole must be greater than zero/);
    expect(() => percentOf(1, -5)).toThrow(/whole must be greater than zero/);
  });
});
