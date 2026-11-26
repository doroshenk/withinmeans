import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import {
  firstMonthFor,
  firstMonthOptions,
  monthLabel,
  monthName,
  startFirstMonthInput,
} from './firstMonth';

const TODAY = Temporal.PlainDate.from('2026-11-18');

describe('P1-09 first month (spec §3 step 1)', () => {
  it('"This month" is the current household month', () => {
    expect(firstMonthFor('this', TODAY)).toBe('2026-11');
  });

  it('"Next month" is the following one', () => {
    expect(firstMonthFor('next', TODAY)).toBe('2026-12');
  });

  it('next month rolls over the year end', () => {
    expect(firstMonthFor('next', Temporal.PlainDate.from('2026-12-31'))).toBe('2027-01');
  });

  it('this month on the last and the first day of a month stays in that month', () => {
    expect(firstMonthFor('this', Temporal.PlainDate.from('2026-11-30'))).toBe('2026-11');
    expect(firstMonthFor('this', Temporal.PlainDate.from('2026-12-01'))).toBe('2026-12');
  });

  it('lists both options for the screen', () => {
    expect(firstMonthOptions(TODAY)).toEqual({ thisMonth: '2026-11', nextMonth: '2026-12' });
  });

  it('labels months with their name and year', () => {
    expect(monthLabel('2026-11')).toBe('November 2026');
    expect(monthLabel('2027-01')).toBe('January 2027');
    expect(monthLabel('2026-12')).toBe('December 2026');
  });

  it('labels every month name', () => {
    const names = Array.from(
      { length: 12 },
      (_, i) => monthLabel(`2026-${String(i + 1).padStart(2, '0')}`).split(' ')[0],
    );
    expect(names).toEqual([
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ]);
  });

  it('P2-04: names a month without its year', () => {
    expect(monthName('2026-11')).toBe('November');
  });

  it('rejects a malformed month label input', () => {
    expect(() => monthLabel('2026-13')).toThrow(RangeError);
  });

  it('the input accepts only "this" or "next"', () => {
    expect(startFirstMonthInput.safeParse({ choice: 'this' }).success).toBe(true);
    expect(startFirstMonthInput.safeParse({ choice: 'next' }).success).toBe(true);
    expect(startFirstMonthInput.safeParse({ choice: 'last' }).success).toBe(false);
    expect(startFirstMonthInput.safeParse({}).success).toBe(false);
  });
});
