import { describe, expect, it } from 'vitest';
import { averageCents } from './money';
import {
  averageReceivedCents,
  expectedWhenText,
  firstRegeneratedPayday,
  monthPaycheckPreview,
  nextThreePaydayMonth,
  paycheckIdInput,
  paycheckMonthSummary,
  paychecksPageInput,
  receivedDifferenceText,
  receivedDraftError,
  receivedPreviewText,
  uncoveredPaydays,
  updatePayScheduleInput,
} from './paycheckPage';
import {
  MAX_TAKE_HOME_CENTS,
  markPaycheckReceivedInput,
  type PayScheduleTemplate,
} from './paychecks';

const TODAY = '2026-11-18';

const mainJob = (over: Partial<PayScheduleTemplate> = {}): PayScheduleTemplate => ({
  id: 'main',
  frequency: 'biweekly',
  anchorDate: '2026-11-06',
  semimonthlyDays: null,
  usualCents: 322_500,
  endedOn: null,
  ...over,
});

const ID = '11111111-1111-4111-8111-111111111111';

describe('P2-09 averageCents', () => {
  it('rounds to the nearest cent, halves up', () => {
    expect(averageCents([100, 101])).toBe(101);
    expect(averageCents([100, 100, 101])).toBe(100);
    expect(averageCents([100, 101, 101])).toBe(101);
    expect(averageCents([324_538])).toBe(324_538);
  });

  it('has no average of nothing, and refuses fractional cents', () => {
    expect(averageCents([])).toBeNull();
    expect(() => averageCents([1.5])).toThrow(RangeError);
  });
});

describe('P2-09 paycheckMonthSummary (design/Paychecks.png tiles)', () => {
  const paychecks = [
    { expectedCents: 322_500, receivedCents: 327_218 },
    { expectedCents: 322_500, receivedCents: null },
  ];
  const other = [{ amountCents: 6_420 }, { amountCents: 12_000 }, { amountCents: 35_000 }];

  it('splits the month into received, still expected, paychecks and one-time income', () => {
    expect(paycheckMonthSummary(paychecks, other)).toStrictEqual({
      receivedCents: 380_638,
      stillExpectedCents: 322_500,
      toComeCount: 1,
      paychecksCents: 649_718,
      paycheckCount: 2,
      otherCents: 53_420,
      otherCount: 3,
    });
  });

  it('is all zeros for an empty month', () => {
    expect(paycheckMonthSummary([], [])).toStrictEqual({
      receivedCents: 0,
      stillExpectedCents: 0,
      toComeCount: 0,
      paychecksCents: 0,
      paycheckCount: 0,
      otherCents: 0,
      otherCount: 0,
    });
  });
});

describe('P2-09 averageReceivedCents: "Average of last 6"', () => {
  const received = (receivedDate: string, receivedCents: number) => ({
    receivedDate,
    receivedCents,
  });

  it('averages the six received most recently, whatever order they come in', () => {
    const seven = [
      received('2026-09-11', 600),
      received('2026-08-14', 999_999),
      received('2026-11-06', 100),
      received('2026-10-23', 200),
      received('2026-08-28', 700),
      received('2026-09-25', 400),
      received('2026-10-09', 300),
    ];

    expect(averageReceivedCents(seven)).toBe(383);
  });

  it('leaves out paychecks not received, and is null when none are', () => {
    const waiting = { receivedDate: null, receivedCents: null };

    expect(averageReceivedCents([waiting, received('2026-11-06', 327_218)])).toBe(327_218);
    expect(averageReceivedCents([waiting])).toBeNull();
  });
});

describe('P2-09 wording on a paycheck row', () => {
  it('compares what landed with what was expected', () => {
    expect(receivedDifferenceText(327_218, 322_500)).toBe('+$47.18 vs expected');
    expect(receivedDifferenceText(321_100, 322_500)).toBe('−$14.00 vs expected');
    expect(receivedDifferenceText(322_500, 322_500)).toBe('Same as expected');
  });

  it('previews the difference while the amount is typed', () => {
    expect(receivedPreviewText('3225.00', 322_500)).toBe('Same as expected.');
    expect(receivedPreviewText('3,272.18', 322_500)).toBe('$47.18 more than expected.');
    expect(receivedPreviewText('3200', 322_500)).toBe('$25.00 less than expected.');
    expect(receivedPreviewText('', 322_500)).toBeNull();
    expect(receivedPreviewText('abc', 322_500)).toBeNull();
    expect(receivedPreviewText('0', 322_500)).toBeNull();
  });

  it.each([
    ['2026-11-18', 'Expected today'],
    ['2026-11-19', 'Expected tomorrow'],
    ['2026-11-20', 'Expected in 2 days'],
    ['2026-12-04', 'Expected in 16 days'],
    ['2026-11-17', 'Was expected Nov 17'],
  ])('says when %s is expected', (date, text) => {
    expect(expectedWhenText(date, TODAY)).toBe(text);
  });
});

describe('P2-09 checking the "received" form', () => {
  const draft = { amountText: '3248.60', date: '2026-11-20' };

  it('accepts an amount above $0 and a real date', () => {
    expect(receivedDraftError(draft)).toBeUndefined();
    expect(receivedDraftError({ ...draft, amountText: '100000000' })).toBeUndefined();
  });

  it.each([
    [{ amountText: '' }, 'Enter the amount that landed, above $0.'],
    [{ amountText: '0' }, 'Enter the amount that landed, above $0.'],
    [{ amountText: '100000000.01' }, 'Enter an amount of $100,000,000 or less.'],
    [{ date: '' }, 'Pick the date it was received.'],
    [{ date: '2026-02-30' }, 'Pick the date it was received.'],
  ])('rejects %o', (over, message) => {
    expect(receivedDraftError({ ...draft, ...over })).toBe(message);
  });

  it('the API input has the same ceiling', () => {
    const input = { id: ID, receivedDate: '2026-11-20' };

    expect(
      markPaycheckReceivedInput.safeParse({ ...input, receivedCents: MAX_TAKE_HOME_CENTS }).success,
    ).toBe(true);
    expect(
      markPaycheckReceivedInput.safeParse({ ...input, receivedCents: MAX_TAKE_HOME_CENTS + 1 })
        .success,
    ).toBe(false);
  });
});

describe('P2-09 nextThreePaydayMonth: the "extra paycheck" heads-up', () => {
  it('finds January 2027 from November 2026', () => {
    expect(nextThreePaydayMonth(mainJob(), '2026-11')).toBe('2027-01');
  });

  it('includes the month asked about', () => {
    expect(nextThreePaydayMonth(mainJob(), '2027-01')).toBe('2027-01');
  });

  it('looks twelve months ahead, no further', () => {
    // Biweekly pay has two such months a year, never more than eight months apart.
    expect(nextThreePaydayMonth(mainJob(), '2027-02')).toBe('2027-07');
  });

  it('is only for pay every 2 weeks that is still running', () => {
    expect(nextThreePaydayMonth(mainJob({ frequency: 'weekly' }), '2026-11')).toBeNull();
    expect(nextThreePaydayMonth(mainJob({ endedOn: '2026-11-18' }), '2026-11')).toBeNull();
  });
});

describe('P2-09 monthPaycheckPreview: a month not started yet', () => {
  it('previews the paydays of this month and later ones', () => {
    expect(monthPaycheckPreview([mainJob()], '2026-12', TODAY)).toStrictEqual([
      { scheduleId: 'main', expectedDate: '2026-12-04', expectedCents: 322_500 },
      { scheduleId: 'main', expectedDate: '2026-12-18', expectedCents: 322_500 },
    ]);
    expect(monthPaycheckPreview([mainJob()], '2026-11', TODAY)).toHaveLength(2);
  });

  it('shows nothing for a past month, or for a stopped schedule', () => {
    expect(monthPaycheckPreview([mainJob()], '2026-10', TODAY)).toEqual([]);
    expect(monthPaycheckPreview([mainJob({ endedOn: '2026-12-10' })], '2026-12', TODAY)).toEqual(
      [],
    );
    expect(() => monthPaycheckPreview([], '2026-13', TODAY)).toThrow(RangeError);
  });
});

describe('P2-09 firstRegeneratedPayday: which paychecks an edit may change', () => {
  it('is today when nothing later has been received', () => {
    expect(firstRegeneratedPayday(TODAY, [])).toBe(TODAY);
    expect(firstRegeneratedPayday(TODAY, ['2026-11-06'])).toBe(TODAY);
  });

  it('is the day after the latest payday already received', () => {
    expect(firstRegeneratedPayday(TODAY, ['2026-11-30', '2026-11-06'])).toBe('2026-12-01');
    expect(firstRegeneratedPayday(TODAY, [TODAY])).toBe('2026-11-19');
  });
});

describe('P2-09 uncoveredPaydays: no second paycheck for a period already paid', () => {
  it.each<[PayScheduleTemplate['frequency'], string[], string[]]>([
    // Received Tue Nov 10, which none of these schedules pays on.
    ['weekly', ['2026-11-07', '2026-11-13'], ['2026-11-06', '2026-11-14']],
    ['biweekly', ['2026-11-04', '2026-11-16'], ['2026-11-03', '2026-11-17']],
    ['semimonthly', ['2026-11-04', '2026-11-16'], ['2026-11-03', '2026-11-17']],
    ['monthly', ['2026-10-27', '2026-11-24'], ['2026-10-26', '2026-11-25']],
  ])('%s: a moved paycheck covers paydays within half a period', (frequency, near, far) => {
    const job = mainJob({ frequency });

    expect(uncoveredPaydays(job, [...near, ...far], ['2026-11-10'])).toEqual(far);
  });

  it('a received paycheck on the schedule covers only itself', () => {
    const twice = mainJob({ frequency: 'semimonthly', semimonthlyDays: [23, 25] });

    expect(uncoveredPaydays(twice, ['2026-11-25'], ['2026-11-23'])).toEqual(['2026-11-25']);
  });

  it('with nothing received every payday stays', () => {
    expect(uncoveredPaydays(mainJob(), ['2026-11-20'], [])).toEqual(['2026-11-20']);
  });
});

describe('P2-09 API inputs', () => {
  const schedule = {
    id: ID,
    name: 'Main job',
    frequency: 'biweekly',
    anchorDate: '2026-11-06',
    usualCents: 322_500,
  };

  it('editing a schedule needs the id and the same fields as adding one', () => {
    expect(updatePayScheduleInput.safeParse(schedule).success).toBe(true);
    expect(updatePayScheduleInput.safeParse({ ...schedule, id: 'x' }).success).toBe(false);
    expect(updatePayScheduleInput.safeParse({ ...schedule, usualCents: 0 }).success).toBe(false);
    expect(updatePayScheduleInput.safeParse({ ...schedule, anchorDate: 'x' }).success).toBe(false);
  });

  it('keeps the rule about the two days of twice-a-month pay', () => {
    const twice = { ...schedule, frequency: 'semimonthly' };

    expect(updatePayScheduleInput.safeParse({ ...twice, semimonthlyDays: [1, 15] }).success).toBe(
      true,
    );
    expect(updatePayScheduleInput.safeParse({ ...twice, semimonthlyDays: [5, 5] }).success).toBe(
      false,
    );
    expect(
      updatePayScheduleInput.safeParse({ ...schedule, semimonthlyDays: [1, 15] }).success,
    ).toBe(false);
  });

  it('the page takes a real month, or none for the current one', () => {
    expect(paychecksPageInput.parse({ ym: '2026-11' })).toEqual({ ym: '2026-11' });
    expect(paychecksPageInput.safeParse({}).success).toBe(true);
    for (const ym of ['2026-13', '2026-1', 'x2026-11', '2026-11x']) {
      expect(paychecksPageInput.safeParse({ ym }).success).toBe(false);
    }
  });

  it('undoing names a paycheck', () => {
    expect(paycheckIdInput.safeParse({ id: ID }).success).toBe(true);
    expect(paycheckIdInput.safeParse({ id: 'x' }).success).toBe(false);
  });
});
