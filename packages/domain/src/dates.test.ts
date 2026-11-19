import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import { addMonths, daysInMonth, monthOf, parseYm, week } from './dates';

const d = (iso: string) => Temporal.PlainDate.from(iso);

describe('week', () => {
  it('T1: week() for Nov 1, 7, 8, 21, 22, 30 → 1, 1, 2, 3, 4, 4', () => {
    const days = [
      '2026-11-01',
      '2026-11-07',
      '2026-11-08',
      '2026-11-21',
      '2026-11-22',
      '2026-11-30',
    ];
    expect(days.map((iso) => week(d(iso)))).toEqual([1, 1, 2, 3, 4, 4]);
  });

  it('week boundaries: days 14 → 2, 15 → 3, and the last day of any month → 4', () => {
    expect(week(d('2026-11-14'))).toBe(2);
    expect(week(d('2026-11-15'))).toBe(3);
    expect(week(d('2026-12-31'))).toBe(4);
    expect(week(d('2026-02-28'))).toBe(4);
    expect(week(d('2024-02-29'))).toBe(4);
  });
});

describe('addMonths', () => {
  it("addMonths('2026-12', 1) → 2027-01", () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01');
  });

  it('goes backwards, across years, and by zero', () => {
    expect(addMonths('2027-01', -1)).toBe('2026-12');
    expect(addMonths('2026-11', 12)).toBe('2027-11');
    expect(addMonths('2026-11', -25)).toBe('2024-10');
    expect(addMonths('2026-11', 0)).toBe('2026-11');
  });

  it('rejects non-integer month counts', () => {
    expect(() => addMonths('2026-11', 1.5)).toThrow(RangeError);
  });
});

describe('monthOf', () => {
  it('returns YYYY-MM for a date', () => {
    expect(monthOf(d('2026-11-18'))).toBe('2026-11');
    expect(monthOf(d('2027-01-01'))).toBe('2027-01');
  });
});

describe('daysInMonth', () => {
  it('covers Feb in leap and non-leap years', () => {
    expect(daysInMonth('2024-02')).toBe(29);
    expect(daysInMonth('2026-02')).toBe(28);
    expect(daysInMonth('2000-02')).toBe(29);
    expect(daysInMonth('2100-02')).toBe(28);
  });

  it('covers 30- and 31-day months', () => {
    expect(daysInMonth('2026-11')).toBe(30);
    expect(daysInMonth('2026-12')).toBe(31);
  });
});

describe('parseYm', () => {
  it('parses a valid YYYY-MM', () => {
    expect(parseYm('2026-11')).toEqual({ year: 2026, month: 11 });
  });

  it.each(['2026-13', '2026-00', '2026-1', '26-11', '2026-11-01', '', 'abcd-ef'])(
    'rejects %j',
    (bad) => {
      expect(() => parseYm(bad)).toThrow(RangeError);
    },
  );
});
