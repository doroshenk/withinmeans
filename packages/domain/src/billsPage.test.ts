import { describe, expect, it } from 'vitest';
import {
  addBillInput,
  billCategoryTotals,
  billEditDraftError,
  billsMonthSummary,
  billWeeks,
  canOpenMonth,
  monthBillPreview,
  oneTimeBillDraftError,
  openMonthInput,
  updateBillInput,
  type BillLine,
} from './billsPage';

const TODAY = '2026-11-18';

const line = (over: Partial<BillLine> & { name: string; dueDate: string }): BillLine => ({
  categoryId: 'utilities',
  estimateCents: 1_000,
  actualCents: null,
  paid: false,
  kind: 'recurring',
  ...over,
});

describe('P2-06 weeks (spec §5.1, §6.2)', () => {
  it('Bills group into the right week by due date', () => {
    const bills = ['01', '07', '08', '14', '15', '21', '22', '30'].map((day) =>
      line({ name: `bill ${day}`, dueDate: `2026-11-${day}` }),
    );

    const weeks = billWeeks(bills, '2026-11', TODAY);

    expect(weeks.map((w) => w.week)).toEqual([1, 2, 3, 4]);
    expect(weeks.map((w) => w.bills.map((b) => b.name))).toEqual([
      ['bill 01', 'bill 07'],
      ['bill 08', 'bill 14'],
      ['bill 15', 'bill 21'],
      ['bill 22', 'bill 30'],
    ]);
  });

  it('orders a week by due date, then name', () => {
    const weeks = billWeeks(
      [
        line({ name: 'Water', dueDate: '2026-11-18' }),
        line({ name: 'Registration', dueDate: '2026-11-16' }),
        line({ name: 'Cable', dueDate: '2026-11-18' }),
      ],
      '2026-11',
      TODAY,
    );

    expect(weeks[2]?.bills.map((b) => b.name)).toEqual(['Registration', 'Cable', 'Water']);
  });

  it.each([
    ['2026-11', ['Nov 1 – 7', 'Nov 8 – 14', 'Nov 15 – 21', 'Nov 22 – 30']],
    ['2027-02', ['Feb 1 – 7', 'Feb 8 – 14', 'Feb 15 – 21', 'Feb 22 – 28']],
    ['2026-12', ['Dec 1 – 7', 'Dec 8 – 14', 'Dec 15 – 21', 'Dec 22 – 31']],
  ])('names the days of each week of %s', (ym, ranges) => {
    expect(billWeeks([], ym, TODAY).map((w) => w.range)).toEqual(ranges);
  });

  it("totals each week at the actual amount or the estimate, with what's paid and left", () => {
    const weeks = billWeeks(
      [
        line({ name: 'a', dueDate: '2026-11-02', actualCents: 9_200, paid: true }),
        line({ name: 'b', dueDate: '2026-11-16', estimateCents: 9_200, paid: true }),
        line({ name: 'c', dueDate: '2026-11-18', estimateCents: 6_800 }),
        line({ name: 'd', dueDate: '2026-11-20', estimateCents: 4_000, actualCents: 4_500 }),
        line({ name: 'e', dueDate: '2026-11-25', estimateCents: 11_000 }),
      ],
      '2026-11',
      TODAY,
    );

    expect(
      weeks.map(({ totalCents, paidCount, leftCents, state }) => ({
        totalCents,
        paidCount,
        leftCents,
        state,
      })),
    ).toEqual([
      { totalCents: 9_200, paidCount: 1, leftCents: 0, state: 'paid' },
      { totalCents: 0, paidCount: 0, leftCents: 0, state: 'none' },
      { totalCents: 20_500, paidCount: 1, leftCents: 11_300, state: 'partly' },
      { totalCents: 11_000, paidCount: 0, leftCents: 11_000, state: 'to-pay' },
    ]);
  });

  it.each([
    ['2026-11', [false, false, true, false], [false, false, true, true]],
    ['2026-12', [false, false, false, false], [true, true, true, true]],
    ['2026-10', [false, false, false, false], [false, false, false, false]],
  ])('opens the current and later weeks of %s', (ym, current, open) => {
    const weeks = billWeeks([], ym, TODAY);

    expect(weeks.map((w) => w.isCurrent)).toEqual(current);
    expect(weeks.map((w) => w.startsOpen)).toEqual(open);
  });
});

describe('P2-06 the tiles (spec §5.6, §6.2)', () => {
  const paychecks = [
    { expectedCents: 322_500, receivedCents: 327_218 },
    { expectedCents: 322_500, receivedCents: null },
  ];
  const otherIncome = [{ amountCents: 53_420 }];
  const bills = [
    line({ name: 'Mortgage', dueDate: '2026-11-01', estimateCents: 282_800, paid: true }),
    line({ name: 'Other bills', dueDate: '2026-11-25', estimateCents: 35_900 }),
  ];

  it('T8: bills & cards, paid so far and left after bills for November', () => {
    const summary = billsMonthSummary({
      bills,
      paychecks,
      otherIncome,
      cards: [{ cardId: 'c', name: 'Cards', plannedPaymentCents: 245_257 }],
      checkingMovedCents: 35_805,
    });

    expect(summary).toEqual({
      incomeCents: 703_138,
      paychecksReceived: 1,
      paycheckCount: 2,
      otherCents: 53_420,
      otherCount: 1,
      checkingMovedCents: 35_805,
      billsCents: 318_700,
      cardsCents: 245_257,
      outCents: 563_957,
      paidCents: 282_800,
      paidPct: 50,
      paidCount: 1,
      billCount: 2,
      leftCents: 174_986,
    });
  });

  it('is all zeros for an empty month', () => {
    expect(billsMonthSummary({ bills: [], paychecks: [], otherIncome: [], cards: [] })).toEqual({
      incomeCents: 0,
      paychecksReceived: 0,
      paycheckCount: 0,
      otherCents: 0,
      otherCount: 0,
      checkingMovedCents: 0,
      billsCents: 0,
      cardsCents: 0,
      outCents: 0,
      paidCents: 0,
      paidPct: 0,
      paidCount: 0,
      billCount: 0,
      leftCents: 0,
    });
  });

  it('can be left with less than nothing', () => {
    const summary = billsMonthSummary({ bills, paychecks: [], otherIncome: [], cards: [] });

    expect(summary.leftCents).toBe(-318_700);
  });
});

describe('P2-06 by category (spec §6.2)', () => {
  const categories = [
    { id: 'housing', name: 'Housing', colorIndex: 0 },
    { id: 'utilities', name: 'Utilities', colorIndex: 1 },
    { id: 'auto', name: 'Auto', colorIndex: 6 },
  ];
  const bills = [
    line({ name: 'Water', dueDate: '2026-11-18', estimateCents: 6_800, actualCents: 7_000 }),
    line({ name: 'Mortgage', dueDate: '2026-11-01', categoryId: 'housing', estimateCents: 28_000 }),
    line({ name: 'Electric', dueDate: '2026-11-10', estimateCents: 7_000 }),
    line({
      name: 'Registration',
      dueDate: '2026-11-16',
      categoryId: 'auto',
      estimateCents: 9_200,
      kind: 'one_time',
    }),
  ];

  it('totals each category with bills, largest first, with a bar next to the largest', () => {
    const totals = billCategoryTotals(bills, categories, 0);

    expect(totals.rows).toEqual([
      { categoryId: 'housing', name: 'Housing', colorIndex: 0, cents: 28_000, barPct: 100 },
      { categoryId: 'utilities', name: 'Utilities', colorIndex: 1, cents: 14_000, barPct: 50 },
      { categoryId: 'auto', name: 'Auto', colorIndex: 6, cents: 9_200, barPct: 33 },
    ]);
    expect(totals.oneTimeCents).toBe(9_200);
  });

  it('shows credit cards as their own line', () => {
    const totals = billCategoryTotals(bills, categories, 56_000);

    expect(totals.rows[0]).toEqual({
      categoryId: null,
      name: 'Credit cards',
      colorIndex: null,
      cents: 56_000,
      barPct: 100,
    });
    expect(totals.rows).toHaveLength(4);
  });

  it('has no rows without bills, and no bar width when everything is $0', () => {
    expect(billCategoryTotals([], categories, 0)).toEqual({ rows: [], oneTimeCents: 0 });
    const free = [line({ name: 'Free', dueDate: '2026-11-01', estimateCents: 0 })];
    expect(billCategoryTotals(free, categories, 0).rows[0]?.barPct).toBe(0);
  });

  it('still counts a bill whose category is not in the list', () => {
    const odd = [line({ name: 'Odd', dueDate: '2026-11-01', categoryId: 'gone' })];

    expect(billCategoryTotals(odd, categories, 0).rows).toEqual([
      { categoryId: 'gone', name: 'Other', colorIndex: null, cents: 1_000, barPct: 100 },
    ]);
  });
});

describe('P2-06 months not started (spec §5.11)', () => {
  const recurring = [
    {
      id: 'r1',
      name: 'Water',
      estimateCents: 6_800,
      dueDay: 18,
      categoryId: 'utilities',
      startYm: '2026-11',
      endYm: null,
    },
  ];

  it.each(['2026-11', '2026-12', '2027-03'])('previews %s from the recurring bills', (ym) => {
    expect(monthBillPreview(recurring, ym, TODAY)).toEqual([
      {
        recurringBillId: 'r1',
        name: 'Water',
        categoryId: 'utilities',
        dueDate: `${ym}-18`,
        estimateCents: 6_800,
      },
    ]);
  });

  it('has nothing to preview for a past month', () => {
    expect(monthBillPreview(recurring, '2026-10', TODAY)).toEqual([]);
  });

  it.each([
    ['2026-09', false],
    ['2026-10', true],
    ['2026-11', true],
    ['2026-12', true],
    ['2027-01', false],
  ])('from first month 2026-10, today Nov 18, %s can be opened: %s', (ym, expected) => {
    expect(canOpenMonth(ym, '2026-10', TODAY)).toBe(expected);
  });

  it('lets a first month further ahead than next month be opened', () => {
    expect(canOpenMonth('2027-02', '2027-02', TODAY)).toBe(true);
    expect(canOpenMonth('2027-01', '2027-02', TODAY)).toBe(false);
  });
});

describe('P2-06 the bill forms', () => {
  const draft = { name: 'Tire rotation', amountText: '60.00', date: '2026-11-24', categoryId: 'c' };

  it('accepts a filled form', () => {
    expect(oneTimeBillDraftError(draft)).toBeUndefined();
    expect(billEditDraftError(draft, '2026-11')).toBeUndefined();
  });

  it.each([
    [{ name: ' ' }, 'Give the bill a name.'],
    [{ amountText: '' }, 'Enter an amount greater than $0.'],
    [{ amountText: '0' }, 'Enter an amount greater than $0.'],
    [{ amountText: '100,000,000.01' }, 'Enter an amount of $100,000,000 or less.'],
    [{ date: '' }, 'Pick the date it is due.'],
    [{ categoryId: '' }, 'Pick a category.'],
  ])('says what is wrong with %o', (over, message) => {
    expect(oneTimeBillDraftError({ ...draft, ...over })).toBe(message);
    expect(billEditDraftError({ ...draft, ...over }, '2026-11')).toBe(message);
  });

  it('keeps an edited bill in its month', () => {
    expect(billEditDraftError({ ...draft, date: '2026-12-01' }, '2026-11')).toBe(
      'Pick a date in November 2026.',
    );
  });

  it('lets an edit set an amount of $0, for a bill that came to nothing', () => {
    expect(billEditDraftError({ ...draft, amountText: '0' }, '2026-11', 'recurring')).toBe(
      undefined,
    );
  });

  const id = '11111111-1111-4111-8111-111111111111';
  const input = { name: ' Tires ', amountCents: 6_000, dueDate: '2026-11-24', categoryId: id };

  it('trims names and takes whole cents', () => {
    expect(addBillInput.parse({ ...input, paid: false }).name).toBe('Tires');
    expect(addBillInput.safeParse({ ...input, paid: false, amountCents: 0 }).success).toBe(false);
    expect(addBillInput.safeParse({ ...input, paid: false, amountCents: 1.5 }).success).toBe(false);
    expect(updateBillInput.safeParse({ ...input, id, amountCents: 0 }).success).toBe(true);
    expect(updateBillInput.safeParse({ ...input, id, amountCents: -1 }).success).toBe(false);
  });

  it('opens only a "YYYY-MM" month', () => {
    expect(openMonthInput.safeParse({ ym: '2026-12' }).success).toBe(true);
    expect(openMonthInput.safeParse({ ym: '2026-13' }).success).toBe(false);
  });
});
