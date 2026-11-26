import { describe, expect, it } from 'vitest';
import {
  addPayScheduleInput,
  markPaycheckReceivedInput,
  monthPaychecksInput,
  paycheckCents,
  paychecksForMonth,
  paychecksTotalCents,
  payScheduleIdInput,
  type PayScheduleTemplate,
} from './paychecks';

/** Spec §10: "Main job", biweekly, anchored Fri Nov 6, 2026, usual $3,225.00. */
const mainJob = (over: Partial<PayScheduleTemplate> = {}): PayScheduleTemplate => ({
  id: 's1',
  frequency: 'biweekly',
  anchorDate: '2026-11-06',
  semimonthlyDays: null,
  usualCents: 322_500,
  endedOn: null,
  ...over,
});

const dates = (schedules: PayScheduleTemplate[], ym: string) =>
  paychecksForMonth(schedules, ym).map((p) => p.expectedDate);

describe('P2-03 paychecksForMonth (spec §5.9)', () => {
  it('expects one paycheck per payday, at the usual take-home', () => {
    expect(paychecksForMonth([mainJob()], '2026-11')).toStrictEqual([
      { scheduleId: 's1', expectedDate: '2026-11-06', expectedCents: 322_500 },
      { scheduleId: 's1', expectedDate: '2026-11-20', expectedCents: 322_500 },
    ]);
  });

  it('orders several schedules by date', () => {
    const side = mainJob({ id: 's2', frequency: 'monthly', anchorDate: '2026-10-10' });

    expect(paychecksForMonth([mainJob(), side], '2026-11').map((p) => p.scheduleId)).toEqual([
      's1',
      's2',
      's1',
    ]);
  });

  it('uses the 1st and 15th for semimonthly unless the schedule has its own days', () => {
    const semi = mainJob({ frequency: 'semimonthly' });

    expect(dates([semi], '2026-12')).toEqual(['2026-12-01', '2026-12-15']);
    expect(dates([{ ...semi, semimonthlyDays: [10, 25] }], '2026-12')).toEqual([
      '2026-12-10',
      '2026-12-25',
    ]);
  });

  it('expects nothing after the day a schedule was stopped; that day still counts', () => {
    expect(dates([mainJob({ endedOn: '2026-11-19' })], '2026-11')).toEqual(['2026-11-06']);
    expect(dates([mainJob({ endedOn: '2026-11-20' })], '2026-11')).toEqual([
      '2026-11-06',
      '2026-11-20',
    ]);
    expect(dates([mainJob({ endedOn: '2026-11-20' })], '2026-12')).toEqual([]);
  });

  it('rejects a malformed month, even with no schedules', () => {
    expect(() => paychecksForMonth([], '2026-13')).toThrow(RangeError);
  });
});

describe('P2-03 money in from paychecks (spec §5.6)', () => {
  const nov6 = { expectedCents: 322_500, receivedCents: 327_218 };
  const nov20 = { expectedCents: 322_500, receivedCents: null };
  const otherIncomeCents = 53_420;

  it('counts the expected amount until received, then the received amount', () => {
    expect(paycheckCents(nov20)).toBe(322_500);
    expect(paycheckCents(nov6)).toBe(327_218);
    expect(paycheckCents({ expectedCents: 322_500, receivedCents: 0 })).toBe(0);
  });

  it('T3: marking Nov 20 received at $3,248.60 replaces the expected amount', () => {
    const received = { ...nov20, receivedCents: 324_860 };

    expect(paychecksTotalCents([nov6, nov20]) + otherIncomeCents).toBe(703_138);
    expect(paychecksTotalCents([nov6, received]) + otherIncomeCents).toBe(705_498);
  });

  it('is zero with no paychecks', () => {
    expect(paychecksTotalCents([])).toBe(0);
  });
});

describe('P2-03 pay schedule input (spec §3 step 3, §5.9)', () => {
  const ID = '11111111-1111-4111-8111-111111111111';
  const valid = {
    name: ' Main job ',
    frequency: 'biweekly',
    anchorDate: '2026-11-06',
    usualCents: 322_500,
  };

  it('P2-09: caps take-home at $100,000,000, so monthly totals stay exact', () => {
    const accepts = (usualCents: number) =>
      addPayScheduleInput.safeParse({ ...valid, usualCents }).success;
    expect(accepts(10_000_000_000)).toBe(true);
    expect(accepts(10_000_000_001)).toBe(false);
  });

  it('accepts a schedule and trims its name', () => {
    expect(addPayScheduleInput.parse(valid)).toStrictEqual({ ...valid, name: 'Main job' });
  });

  it('accepts semimonthly days and an account', () => {
    const input = { ...valid, frequency: 'semimonthly', semimonthlyDays: [10, 25], accountId: ID };

    expect(addPayScheduleInput.safeParse(input).success).toBe(true);
  });

  it.each([
    ['an empty name', { name: '  ' }],
    ['a take-home of zero', { usualCents: 0 }],
    ['fractional cents', { usualCents: 10.5 }],
    ['an unknown frequency', { frequency: 'yearly' }],
    ['a date that does not exist', { anchorDate: '2026-02-30' }],
    ['the same day twice', { frequency: 'semimonthly', semimonthlyDays: [15, 15] }],
    ['a day past 31', { frequency: 'semimonthly', semimonthlyDays: [1, 32] }],
    ['semimonthly days on another frequency', { semimonthlyDays: [1, 15] }],
    ['an account id that is not a UUID', { accountId: 'x' }],
  ])('rejects %s', (_why, over) => {
    expect(addPayScheduleInput.safeParse({ ...valid, ...over }).success).toBe(false);
  });

  it('says what is wrong with the semimonthly days', () => {
    const result = addPayScheduleInput.safeParse({
      ...valid,
      frequency: 'semimonthly',
      semimonthlyDays: [15, 15],
    });

    expect(result.error?.issues).toMatchObject([
      {
        path: ['semimonthlyDays'],
        message: 'Pick two different days, for semimonthly pay only.',
      },
    ]);
  });

  it('names a schedule by id', () => {
    expect(payScheduleIdInput.safeParse({ id: ID }).success).toBe(true);
    expect(payScheduleIdInput.safeParse({ id: 'x' }).success).toBe(false);
  });

  it('asks for a month as YYYY-MM', () => {
    expect(monthPaychecksInput.safeParse({ ym: '2026-11' }).success).toBe(true);
    for (const ym of ['2026-13', '2026-00', '2026-111', '12026-11']) {
      expect(monthPaychecksInput.safeParse({ ym }).success).toBe(false);
    }
  });

  it('marks a paycheck received with a positive amount and a real date', () => {
    const received = { id: ID, receivedCents: 324_860, receivedDate: '2026-11-19' };

    expect(markPaycheckReceivedInput.safeParse(received).success).toBe(true);
    for (const over of [{ receivedCents: 0 }, { receivedDate: '2026-11-31' }, { id: 'x' }]) {
      expect(markPaycheckReceivedInput.safeParse({ ...received, ...over }).success).toBe(false);
    }
  });
});
