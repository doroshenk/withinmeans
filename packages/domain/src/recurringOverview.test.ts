import { describe, expect, it } from 'vitest';
import { deleteCategoryInput } from './categories';
import { formatShortDate } from './dates';
import { ordinal, updateRecurringBillInput } from './recurringBills';
import {
  categoryTotals,
  dueInText,
  lastKeptMonth,
  newBillStartMonth,
  nextDueDate,
  recurringOverview,
  sortRecurring,
  type RecurringBillItem,
} from './recurringOverview';

const TODAY = '2026-11-18';

const bill = (
  name: string,
  estimateCents: number,
  dueDay: number,
  categoryId: string,
  autopay: boolean,
  extra: Partial<RecurringBillItem> = {},
): RecurringBillItem => ({
  id: name,
  name,
  estimateCents,
  dueDay,
  categoryId,
  autopay,
  startYm: '2026-01',
  endYm: null,
  ...extra,
});

/** Spec §10: 12 bills, $2,750/month, with the due days on design/Recurring.png. */
const SEED = [
  bill('Mortgage', 185_000, 1, 'housing', true),
  bill('Electric', 16_400, 5, 'utilities', true),
  bill('Pool service', 12_000, 6, 'home', false),
  bill('Internet', 8_000, 10, 'utilities', true),
  bill('Car insurance', 14_200, 12, 'insurance', true),
  bill('Phone', 9_500, 14, 'utilities', true),
  bill('Water & sewer', 6_800, 18, 'utilities', false),
  bill('CD contribution · 2', 2_000, 20, 'savings', true),
  bill('CD contribution · 1', 2_000, 20, 'savings', true),
  bill('Lawn supplies', 4_500, 21, 'home', false),
  bill('HOA dues', 11_000, 25, 'housing', false),
  bill('Streaming', 3_600, 28, 'subscriptions', true),
];

const GYM_ENDED = bill('Gym', 3_000, 3, 'home', true, { endYm: '2026-10' });

describe('P2-08 nextDueDate', () => {
  it.each([
    [18, '2026-11-18'],
    [20, '2026-11-20'],
    [1, '2026-12-01'],
    [17, '2026-12-17'],
  ])('due day %i on Nov 18 is next due %s', (dueDay, expected) => {
    expect(nextDueDate({ dueDay, startYm: '2026-01' }, TODAY)).toBe(expected);
  });

  it('rolls over the year', () => {
    expect(nextDueDate({ dueDay: 5, startYm: '2026-01' }, '2026-12-06')).toBe('2027-01-05');
  });

  it('a bill that starts in a later month is first due then', () => {
    expect(nextDueDate({ dueDay: 25, startYm: '2027-02' }, TODAY)).toBe('2027-02-25');
  });
});

describe('P2-08 dueInText', () => {
  it.each([
    [0, 'Due today', true],
    [1, 'Tomorrow', true],
    [3, 'In 3 days', true],
    [4, 'In 4 days', false],
    [26, 'In 26 days', false],
  ])('%i days away reads "%s"', (days, text, soon) => {
    expect(dueInText(days)).toEqual({ text, soon });
  });
});

describe('P2-08 recurringOverview (spec §10 bills, today Wed Nov 18, 2026)', () => {
  const overview = () => recurringOverview([...SEED, GYM_ENDED], TODAY);

  it('totals $2,750 over 12 bills, 8 on autopay, leaving ended bills out', () => {
    const o = overview();
    expect(o.totalCents).toBe(275_000);
    expect(o.count).toBe(12);
    expect(o.autopayCount).toBe(8);
    expect(o.manualCount).toBe(4);
    expect(o.ended).toEqual([GYM_ENDED]);
  });

  it('lists the bills next due first, by name on the same day', () => {
    const o = overview();
    expect(o.active.map((b) => b.name).slice(0, 4)).toEqual([
      'Water & sewer',
      'CD contribution · 1',
      'CD contribution · 2',
      'Lawn supplies',
    ]);
    expect(o.active.at(-1)).toMatchObject({ name: 'Phone', nextDue: '2026-12-14', daysUntil: 26 });
  });

  it('names the next bill up', () => {
    expect(overview().nextUp).toMatchObject({
      name: 'Water & sewer',
      nextDue: TODAY,
      daysUntil: 0,
    });
  });

  it('adds up each week of the month by due day', () => {
    const { weeks } = overview();
    expect(weeks.map((w) => [w.week, w.totalCents])).toEqual([
      [1, 213_400],
      [2, 31_700],
      [3, 15_300],
      [4, 14_600],
    ]);
    expect(weeks[1]?.bills.map((b) => b.name)).toEqual(['Internet', 'Car insurance', 'Phone']);
    expect(weeks.map((w) => w.barPercent)).toEqual([100, 15, 7, 7]);
  });

  it('with no bills: zeros, four empty weeks and nothing next up', () => {
    const none = recurringOverview([], TODAY);
    expect(none).toMatchObject({ totalCents: 0, count: 0, nextUp: null, active: [], ended: [] });
    expect(none.weeks.map((w) => [w.totalCents, w.barPercent])).toEqual([
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
    ]);
  });
});

describe('P2-08 sortRecurring', () => {
  const active = () => recurringOverview(SEED, TODAY).active;

  it('by amount, biggest first', () => {
    expect(
      sortRecurring(active(), 'amount')
        .map((b) => b.name)
        .slice(0, 2),
    ).toEqual(['Mortgage', 'Electric']);
  });

  it('by name', () => {
    expect(
      sortRecurring(active(), 'name')
        .map((b) => b.name)
        .slice(0, 2),
    ).toEqual(['Car insurance', 'CD contribution · 1']);
  });

  it('by next due date, without changing the list given', () => {
    const byName = sortRecurring(active(), 'name');
    const before = byName.map((b) => b.name);
    expect(sortRecurring(byName, 'next-due')).toEqual(active());
    expect(byName.map((b) => b.name)).toEqual(before);
  });
});

describe('P2-08 categoryTotals', () => {
  it('counts and totals the bills of each category, without ended ones', () => {
    const totals = categoryTotals([...SEED, GYM_ENDED]);
    expect(totals.get('housing')).toEqual({ count: 2, totalCents: 196_000 });
    expect(totals.get('utilities')).toEqual({ count: 4, totalCents: 40_700 });
    expect(totals.get('home')).toEqual({ count: 2, totalCents: 16_500 });
    expect(totals.has('auto')).toBe(false);
  });
});

describe('P2-08 lastKeptMonth: the last month an ended bill stays in', () => {
  it('is the latest started month up to this one', () => {
    expect(lastKeptMonth(['2026-10', '2026-11'], '2026-11')).toBe('2026-11');
  });

  it('is the previous month when this one has not been started', () => {
    expect(lastKeptMonth(['2026-11', '2026-10'], '2026-12')).toBe('2026-11');
  });

  it('ignores a month started ahead of time', () => {
    expect(lastKeptMonth(['2026-11', '2026-12'], '2026-11')).toBe('2026-11');
  });

  it('is the month before this one when no month up to now was started', () => {
    expect(lastKeptMonth(['2026-12'], '2026-11')).toBe('2026-10');
    expect(lastKeptMonth([], '2026-01')).toBe('2025-12');
  });
});

describe('P2-08 newBillStartMonth', () => {
  it('is this month, so past months get no new bill', () => {
    expect(newBillStartMonth('2026-01', '2026-11')).toBe('2026-11');
  });

  it('is the first month when tracking starts later', () => {
    expect(newBillStartMonth('2026-12', '2026-11')).toBe('2026-12');
  });
});

describe('P2-08 words', () => {
  it.each([
    [1, '1st'],
    [2, '2nd'],
    [3, '3rd'],
    [11, '11th'],
    [18, '18th'],
    [22, '22nd'],
  ])('ordinal(%i) is %s', (day, text) => {
    expect(ordinal(day)).toBe(text);
  });

  it.each([
    ['2026-11-18', 'Wed, Nov 18'],
    ['2026-12-01', 'Tue, Dec 1'],
    ['2026-11-28', 'Sat, Nov 28'],
    ['2027-01-03', 'Sun, Jan 3'],
  ])('formatShortDate(%s) is "%s"', (date, text) => {
    expect(formatShortDate(date)).toBe(text);
  });
});

describe('P2-08 inputs', () => {
  const ID = '11111111-1111-4111-8111-111111111111';
  const valid = {
    id: ID,
    name: ' Rent ',
    estimateCents: 150_000,
    dueDay: 1,
    categoryId: ID,
    autopay: true,
  };

  it('an edit takes every field, trimmed', () => {
    expect(updateRecurringBillInput.parse(valid)).toEqual({ ...valid, name: 'Rent' });
  });

  it.each([{ name: ' ' }, { estimateCents: 0 }, { dueDay: 29 }, { id: 'nope' }])(
    'an edit rejects %o',
    (bad) => {
      expect(updateRecurringBillInput.parse(valid)).toBeDefined();
      expect(updateRecurringBillInput.safeParse({ ...valid, ...bad }).success).toBe(false);
    },
  );

  it('a category delete may name where the bills move', () => {
    expect(deleteCategoryInput.parse({ id: ID, moveToId: ID })).toEqual({ id: ID, moveToId: ID });
    expect(deleteCategoryInput.safeParse({ id: ID, moveToId: 'nope' }).success).toBe(false);
  });
});
