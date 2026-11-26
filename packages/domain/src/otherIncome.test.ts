import { describe, expect, it } from 'vitest';
import {
  addOtherIncomeInput,
  OTHER_INCOME_TYPE_LABELS,
  OTHER_INCOME_TYPES,
  otherIncomeDraftError,
  otherIncomeForMonth,
  otherIncomeTotalCents,
  recentSources,
  type OtherIncomeItem,
} from './otherIncome';

const item = (over: Partial<OtherIncomeItem> & { id: string; date: string }): OtherIncomeItem => ({
  source: 'Freelance web work',
  type: 'side_work',
  amountCents: 35_000,
  accountId: 'a-checking',
  note: null,
  ...over,
});

/** Spec §10: November's one-time income, $534.20 from 3 entries. */
const freelance = item({ id: 'i1', date: '2026-11-03', note: 'Site fixes' });
const sale = item({
  id: 'i2',
  date: '2026-11-12',
  source: 'Marketplace sale',
  type: 'sale',
  amountCents: 12_000,
  accountId: 'a-cash',
});
const refund = item({
  id: 'i3',
  date: '2026-11-15',
  source: 'Insurance refund',
  type: 'refund',
  amountCents: 6_420,
});
const november = [freelance, sale, refund];

describe('P2-04 other income by month', () => {
  it('Other income counts in the month of its date', () => {
    const items = [
      item({ id: 'oct', date: '2026-10-31', amountCents: 100 }),
      item({ id: 'first', date: '2026-11-01', amountCents: 200 }),
      item({ id: 'last', date: '2026-11-30', amountCents: 400 }),
      item({ id: 'dec', date: '2026-12-01', amountCents: 800 }),
      item({ id: 'last-year', date: '2025-11-15', amountCents: 1_600 }),
    ];

    expect(otherIncomeForMonth(items, '2026-11').map((i) => i.id)).toEqual(['last', 'first']);
    expect(otherIncomeTotalCents(otherIncomeForMonth(items, '2026-11'))).toBe(600);
    expect(otherIncomeTotalCents(otherIncomeForMonth(items, '2026-10'))).toBe(100);
    expect(otherIncomeTotalCents(otherIncomeForMonth(items, '2026-12'))).toBe(800);
  });

  it("T2 (partial): November's one-time income is $534.20 from 3 entries, newest first", () => {
    const found = otherIncomeForMonth(november, '2026-11');

    expect(found.map((i) => i.id)).toEqual(['i3', 'i2', 'i1']);
    expect(otherIncomeTotalCents(found)).toBe(53_420);
  });

  it('is zero for a month with none', () => {
    expect(otherIncomeTotalCents(otherIncomeForMonth(november, '2027-01'))).toBe(0);
  });

  it('rejects a month that is not YYYY-MM', () => {
    expect(() => otherIncomeForMonth(november, '2026-1')).toThrow(RangeError);
  });
});

describe('P2-04 recent sources', () => {
  it('offers each source once, newest first, with its latest type and account', () => {
    const older = item({
      id: 'old',
      date: '2026-10-02',
      source: 'Marketplace sale',
      type: 'other',
      accountId: null,
    });

    expect(recentSources([older, ...november])).toEqual([
      { source: 'Insurance refund', type: 'refund', accountId: 'a-checking' },
      { source: 'Marketplace sale', type: 'sale', accountId: 'a-cash' },
      { source: 'Freelance web work', type: 'side_work', accountId: 'a-checking' },
    ]);
  });

  it('stops at three', () => {
    const gift = item({ id: 'g', date: '2026-11-17', source: 'Birthday', type: 'gift' });

    expect(recentSources([...november, gift]).map((r) => r.source)).toEqual([
      'Birthday',
      'Insurance refund',
      'Marketplace sale',
    ]);
  });
});

describe('P2-04 the one-time income form', () => {
  const draft = { source: 'Gift', amountText: '25.00', date: '2026-11-18' };

  it('names the types the design offers', () => {
    expect(OTHER_INCOME_TYPES.map((t) => OTHER_INCOME_TYPE_LABELS[t])).toEqual([
      'Side work',
      'Sale',
      'Refund',
      'Gift',
      'Bonus',
      'Other',
    ]);
  });

  it('accepts a complete draft', () => {
    expect(otherIncomeDraftError(draft)).toBeUndefined();
  });

  it.each([
    [{ source: '  ' }, 'Say where the money came from.'],
    [{ amountText: '' }, 'Enter an amount more than zero.'],
    [{ amountText: '0' }, 'Enter an amount more than zero.'],
    [{ amountText: '-5' }, 'Enter an amount more than zero.'],
    [{ amountText: 'ten' }, 'Enter an amount more than zero.'],
    [{ date: '' }, 'Pick the date the money came in.'],
    [{ date: '2026-02-30' }, 'Pick the date the money came in.'],
  ])('reports %o', (over, message) => {
    expect(otherIncomeDraftError({ ...draft, ...over })).toBe(message);
  });

  const input = {
    source: ' Marketplace sale ',
    type: 'sale',
    amountCents: 12_000,
    date: '2026-11-12',
  };

  it('trims the source and note; a blank note is no note', () => {
    expect(addOtherIncomeInput.parse({ ...input, note: ' Old bike ' })).toMatchObject({
      source: 'Marketplace sale',
      note: 'Old bike',
    });
    expect(addOtherIncomeInput.parse({ ...input, note: '  ' }).note).toBeUndefined();
    expect(addOtherIncomeInput.parse(input).note).toBeUndefined();
  });

  it.each([
    { source: ' ' },
    { type: 'lottery' },
    { amountCents: 0 },
    { amountCents: 10.5 },
    { date: '2026-02-30' },
    { accountId: 'checking' },
  ])('the API refuses %o', (over) => {
    expect(addOtherIncomeInput.safeParse({ ...input, ...over }).success).toBe(false);
  });
});
