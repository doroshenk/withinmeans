import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import { isThreePaydayMonth, paydaysForMonth, type PaySchedule } from './paydays';

const d = (iso: string) => Temporal.PlainDate.from(iso);
const days = (schedule: PaySchedule, ym: string) =>
  paydaysForMonth(schedule, ym).map((date) => date.toString());
const months = (year: number) =>
  Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);

const mainJob: PaySchedule = { frequency: 'biweekly', anchorDate: d('2026-11-06') };

describe('biweekly paydays', () => {
  it('T24: anchored Fri Nov 6, 2026 → Nov 6 and Nov 20; December → Dec 4 and Dec 18', () => {
    expect(days(mainJob, '2026-11')).toEqual(['2026-11-06', '2026-11-20']);
    expect(days(mainJob, '2026-12')).toEqual(['2026-12-04', '2026-12-18']);
  });

  it('runs backwards from the anchor too, since the anchor is any recent payday', () => {
    expect(days(mainJob, '2026-10')).toEqual(['2026-10-09', '2026-10-23']);
    const later: PaySchedule = { frequency: 'biweekly', anchorDate: d('2026-11-20') };
    expect(days(later, '2026-11')).toEqual(['2026-11-06', '2026-11-20']);
  });

  it('includes the first and last day of a month, across a year boundary', () => {
    expect(days(mainJob, '2027-01')).toEqual(['2027-01-01', '2027-01-15', '2027-01-29']);
    const endOfMonth: PaySchedule = { frequency: 'biweekly', anchorDate: d('2026-11-30') };
    expect(days(endOfMonth, '2026-11')).toEqual(['2026-11-02', '2026-11-16', '2026-11-30']);
  });

  it('does not depend on how far away the anchor is', () => {
    const old: PaySchedule = { frequency: 'biweekly', anchorDate: d('2020-01-03') };
    // 2020-01-03 + 179 × 14 days = 2026-11-13
    expect(days(old, '2026-11')).toEqual(['2026-11-13', '2026-11-27']);
  });
});

describe('the "3 paydays" note', () => {
  it('detects the biweekly months with 3 paydays', () => {
    expect(months(2026).filter((ym) => isThreePaydayMonth(mainJob, ym))).toEqual([
      '2026-01',
      '2026-07',
    ]);
    expect(days(mainJob, '2026-07')).toEqual(['2026-07-03', '2026-07-17', '2026-07-31']);
    expect(isThreePaydayMonth(mainJob, '2027-01')).toBe(true);
    expect(isThreePaydayMonth(mainJob, '2026-11')).toBe(false);
  });

  it('is only for biweekly schedules', () => {
    // Semimonthly days that roll over can put 3 paydays in March 2027.
    const rolling: PaySchedule = { frequency: 'semimonthly', days: [15, 31] };
    expect(paydaysForMonth(rolling, '2027-03')).toHaveLength(3);
    expect(isThreePaydayMonth(rolling, '2027-03')).toBe(false);
    const weekly: PaySchedule = { frequency: 'weekly', anchorDate: d('2026-11-06') };
    expect(months(2026).some((ym) => isThreePaydayMonth(weekly, ym))).toBe(false);
  });
});

describe('weekly paydays', () => {
  it('every 7 days from the anchor, in both directions', () => {
    const weekly: PaySchedule = { frequency: 'weekly', anchorDate: d('2026-11-20') };
    expect(days(weekly, '2026-11')).toEqual([
      '2026-11-06',
      '2026-11-13',
      '2026-11-20',
      '2026-11-27',
    ]);
    expect(days(weekly, '2026-12')).toEqual([
      '2026-12-04',
      '2026-12-11',
      '2026-12-18',
      '2026-12-25',
    ]);
  });

  it('finds 5 paydays when the month has them', () => {
    const weekly: PaySchedule = { frequency: 'weekly', anchorDate: d('2026-11-06') };
    expect(days(weekly, '2027-01')).toHaveLength(5);
  });
});

describe('semimonthly paydays', () => {
  const standard: PaySchedule = { frequency: 'semimonthly' };

  it('defaults to the 1st and 15th', () => {
    expect(days(standard, '2026-12')).toEqual(['2026-12-01', '2026-12-15']);
  });

  it('moves a Sunday payday to the next business day', () => {
    // Nov 1 and Nov 15, 2026 are Sundays.
    expect(days(standard, '2026-11')).toEqual(['2026-11-02', '2026-11-16']);
  });

  it('moves a Saturday payday to the following Monday', () => {
    // Aug 1 and Aug 15, 2026 are Saturdays.
    expect(days(standard, '2026-08')).toEqual(['2026-08-03', '2026-08-17']);
  });

  it('uses the configured days, in date order', () => {
    const custom: PaySchedule = { frequency: 'semimonthly', days: [20, 5] };
    expect(days(custom, '2026-11')).toEqual(['2026-11-05', '2026-11-20']);
  });

  it('uses the last day of a month that is too short', () => {
    const late: PaySchedule = { frequency: 'semimonthly', days: [15, 30] };
    expect(days(late, '2028-02')).toEqual(['2028-02-15', '2028-02-29']);
  });

  it('counts a payday moved past month end in the month it is paid', () => {
    const late: PaySchedule = { frequency: 'semimonthly', days: [15, 31] };
    // Jan 31 and Feb 28, 2027 are Sundays.
    expect(days(late, '2027-01')).toEqual(['2027-01-15']);
    expect(days(late, '2027-02')).toEqual(['2027-02-01', '2027-02-15']);
    expect(days(late, '2027-03')).toEqual(['2027-03-01', '2027-03-15', '2027-03-31']);
  });

  it('lists a date once when both days land on it', () => {
    const adjacent: PaySchedule = { frequency: 'semimonthly', days: [1, 2] };
    expect(days(adjacent, '2026-08')).toEqual(['2026-08-03']);
  });

  it('lists a date once when last month rolls onto this month’s payday', () => {
    const ends: PaySchedule = { frequency: 'semimonthly', days: [1, 31] };
    // Jan 31 moves to Mon Feb 1, 2027, and Feb 28 moves out to Mar 1.
    expect(days(ends, '2027-02')).toEqual(['2027-02-01']);
  });

  it.each([
    [0, 15],
    [1, 32],
    [1.5, 15],
    [15, 15],
  ] as const)('rejects the days %j and %j', (first, second) => {
    expect(() =>
      paydaysForMonth({ frequency: 'semimonthly', days: [first, second] }, '2026-11'),
    ).toThrow(`Invalid semimonthly days ${first} and ${second}, expected two different days 1-31`);
  });
});

describe('monthly paydays', () => {
  it("uses the anchor's day of month, before and after the anchor", () => {
    const monthly: PaySchedule = { frequency: 'monthly', anchorDate: d('2026-11-10') };
    expect(days(monthly, '2026-09')).toEqual(['2026-09-10']);
    expect(days(monthly, '2026-11')).toEqual(['2026-11-10']);
    expect(days(monthly, '2027-02')).toEqual(['2027-02-10']);
  });

  it('uses the last day of a month that is too short', () => {
    const monthly: PaySchedule = { frequency: 'monthly', anchorDate: d('2026-10-31') };
    expect(days(monthly, '2026-11')).toEqual(['2026-11-30']);
    expect(days(monthly, '2027-02')).toEqual(['2027-02-28']);
    expect(days(monthly, '2026-12')).toEqual(['2026-12-31']);
  });

  it('stays on a weekend day', () => {
    const monthly: PaySchedule = { frequency: 'monthly', anchorDate: d('2026-10-15') };
    // Nov 15, 2026 is a Sunday.
    expect(days(monthly, '2026-11')).toEqual(['2026-11-15']);
  });
});

describe('invalid months', () => {
  it.each([
    { frequency: 'weekly', anchorDate: d('2026-11-06') },
    { frequency: 'biweekly', anchorDate: d('2026-11-06') },
    { frequency: 'semimonthly' },
    { frequency: 'monthly', anchorDate: d('2026-11-06') },
  ] satisfies PaySchedule[])('$frequency rejects a malformed year-month', (schedule) => {
    expect(() => paydaysForMonth(schedule, '2026-13')).toThrow(RangeError);
  });
});
