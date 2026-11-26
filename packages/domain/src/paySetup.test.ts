import { describe, expect, it } from 'vitest';
import { formatMonthDay } from './dates';
import {
  monthlyPayCents,
  nextPaydays,
  payDraftError,
  setupPaychecksError,
  type PayDraft,
} from './paySetup';
import { shareOfTakeHome } from './recurringBills';

const pay = (
  frequency: 'weekly' | 'biweekly' | 'semimonthly' | 'monthly',
  usualCents: number,
  endedOn: string | null = null,
) => ({ frequency, usualCents, endedOn });

describe('P2-09 monthlyPayCents: a typical month', () => {
  it.each([
    ['weekly', 400_000],
    ['biweekly', 200_000],
    ['semimonthly', 200_000],
    ['monthly', 100_000],
  ] as const)('%s pay of 100,000 cents is %i cents a month', (frequency, cents) => {
    expect(monthlyPayCents([pay(frequency, 100_000)])).toBe(cents);
  });

  it('spec §10: Main job is $6,450 a month, and the bills are 43% of it', () => {
    const monthly = monthlyPayCents([pay('biweekly', 322_500)]);
    expect(monthly).toBe(645_000);
    expect(shareOfTakeHome(275_000, monthly)).toBe('43%');
  });

  it('adds up the running schedules and leaves stopped ones out', () => {
    const schedules = [
      pay('biweekly', 322_500),
      pay('monthly', 50_000),
      pay('weekly', 10_000, '2026-10-01'),
    ];
    expect(monthlyPayCents(schedules)).toBe(695_000);
  });

  it('is null with no running schedule', () => {
    expect(monthlyPayCents([])).toBeNull();
    expect(monthlyPayCents([pay('weekly', 10_000, '2026-10-01')])).toBeNull();
  });
});

describe('P2-09 nextPaydays (today Wed Nov 18, 2026)', () => {
  const biweekly = {
    frequency: 'biweekly',
    anchorDate: '2026-11-06',
    semimonthlyDays: null,
  } as const;

  it('spec §10: the next 3 paydays of Main job', () => {
    expect(nextPaydays(biweekly, '2026-11-18')).toEqual(['2026-11-20', '2026-12-04', '2026-12-18']);
  });

  it('counts today when it is a payday', () => {
    expect(nextPaydays(biweekly, '2026-11-20')[0]).toBe('2026-11-20');
  });

  it('works from a payday that is still to come', () => {
    expect(nextPaydays({ ...biweekly, anchorDate: '2027-01-01' }, '2026-11-18')[0]).toBe(
      '2026-11-20',
    );
  });

  it('weekly pay runs into the next month', () => {
    expect(nextPaydays({ ...biweekly, frequency: 'weekly' }, '2026-11-25')).toEqual([
      '2026-11-27',
      '2026-12-04',
      '2026-12-11',
    ]);
  });

  it('semimonthly pay moves weekends to the next business day', () => {
    const schedule = { ...biweekly, frequency: 'semimonthly', semimonthlyDays: [1, 15] } as const;
    expect(nextPaydays(schedule, '2026-11-18')).toEqual(['2026-12-01', '2026-12-15', '2027-01-01']);
  });

  it('monthly pay rolls over the year', () => {
    expect(nextPaydays({ ...biweekly, frequency: 'monthly' }, '2026-11-18')).toEqual([
      '2026-12-06',
      '2027-01-06',
      '2027-02-06',
    ]);
  });
});

describe('P2-09 payDraftError: take-home must be > 0 and the date valid', () => {
  const draft: PayDraft = {
    name: 'Main job',
    frequency: 'biweekly',
    anchorDate: '2026-11-06',
    takeHomeText: '3,225.00',
    dayTexts: ['1', '15'],
  };

  it('accepts a complete draft', () => {
    expect(payDraftError(draft)).toBeUndefined();
  });

  it('needs a name', () => {
    expect(payDraftError({ ...draft, name: ' ' })).toBe('Enter a name for this paycheck.');
  });

  it.each(['', '0', '0.00', '-5', 'abc'])('P2-09: take-home "%s" is rejected', (takeHomeText) => {
    expect(payDraftError({ ...draft, takeHomeText })).toBe('Enter a take-home above $0.');
  });

  it('P2-09: take-home can be at most $100,000,000', () => {
    expect(payDraftError({ ...draft, takeHomeText: '100,000,000.00' })).toBeUndefined();
    for (const takeHomeText of ['100,000,000.01', '9999999999999999']) {
      expect(payDraftError({ ...draft, takeHomeText })).toBe(
        'Enter a take-home of $100,000,000 or less.',
      );
    }
  });

  it.each(['', '2026-02-30', '11/06/2026', '2026-13-01'])(
    'P2-09: payday "%s" is rejected',
    (anchorDate) => {
      expect(payDraftError({ ...draft, anchorDate })).toBe('Pick a recent payday.');
    },
  );

  it.each([
    ['', '15'],
    ['0', '15'],
    ['1', '32'],
    ['15', '15'],
    ['1.5', '15'],
  ])('twice a month rejects the days "%s" and "%s"', (first, second) => {
    const bad = { ...draft, frequency: 'semimonthly', dayTexts: [first, second] } as const;
    expect(payDraftError(bad)).toBe('Pick two different pay days from 1 to 31.');
  });

  it('only looks at the two days for twice-a-month pay', () => {
    expect(payDraftError({ ...draft, dayTexts: ['', ''] })).toBeUndefined();
    expect(payDraftError({ ...draft, frequency: 'semimonthly' })).toBeUndefined();
  });
});

describe('P2-09 setup step 3 checks', () => {
  it('cannot be finished without a paycheck', () => {
    expect(setupPaychecksError(0)).toBe('Add a paycheck, or skip this step.');
    expect(setupPaychecksError(1)).toBeUndefined();
  });

  it('writes a payday as "Nov 20"', () => {
    expect(formatMonthDay('2026-11-20')).toBe('Nov 20');
    expect(formatMonthDay('2027-01-01')).toBe('Jan 1');
  });
});
