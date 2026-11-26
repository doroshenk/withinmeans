import { describe, expect, it } from 'vitest';
import {
  CASHFLOW_STATUS_LABELS,
  kept,
  missingCards,
  moneyIn,
  moneyOut,
  spentPct,
  status,
  type MonthCashflow,
} from './cashflow';

const month = (over: Partial<MonthCashflow> = {}): MonthCashflow => ({
  paychecks: [],
  otherIncome: [],
  bills: [],
  cards: [],
  ...over,
});

const pay = (expectedCents: number, receivedCents: number | null = null) => ({
  expectedCents,
  receivedCents,
});
const bill = (estimateCents: number, actualCents: number | null = null) => ({
  estimateCents,
  actualCents,
});
const card = (name: string, plannedPaymentCents: number | null) => ({
  cardId: name.toLowerCase(),
  name,
  plannedPaymentCents,
});

/** A month with just money in and money out. */
const inAndOut = (inCents: number, outCents: number) =>
  month({ otherIncome: [{ amountCents: inCents }], bills: [bill(outCents)] });

describe('P2-05 money in (spec §5.6)', () => {
  const november = month({
    paychecks: [pay(322_500, 327_218), pay(322_500)],
    otherIncome: [{ amountCents: 40_000 }, { amountCents: 6_420 }, { amountCents: 7_000 }],
  });

  it('T2: November paychecks + other income with Nov 20 still expected = $7,031.38', () => {
    expect(moneyIn(november)).toBe(703_138);
  });

  it('adds investment income actually moved to checking, which is 0 when not given', () => {
    expect(moneyIn({ ...november, checkingMovedCents: 35_805 })).toBe(738_943);
    expect(moneyIn({ ...november, checkingMovedCents: 0 })).toBe(703_138);
  });

  it('is zero for an empty month', () => {
    expect(moneyIn(month())).toBe(0);
  });
});

describe('P2-05 money out (spec §5.6)', () => {
  it('counts the actual amount of a bill when there is one, else the estimate, never both', () => {
    const bills = [bill(16_400, 17_125), bill(185_000), bill(6_800, 0)];

    expect(moneyOut(month({ bills }))).toBe(202_125);
  });

  it('adds the planned card payments', () => {
    const cards = [card('Blue', 128_417), card('Green', 0)];

    expect(moneyOut(month({ bills: [bill(10_000)], cards }))).toBe(138_417);
  });

  it('P2-05: cards with no statement count $0 and are reported as missing', () => {
    const cards = [card('Blue', 50_000), card('Green', null), card('Gold', 0), card('Red', null)];

    expect(moneyOut(month({ cards }))).toBe(50_000);
    expect(missingCards(cards)).toEqual([card('Green', null), card('Red', null)]);
  });

  it('reports no missing cards when every card has a statement', () => {
    expect(missingCards([card('Blue', 0)])).toEqual([]);
    expect(missingCards([])).toEqual([]);
  });
});

describe('P2-05 kept, spent % and status (spec §5.6)', () => {
  it('keeps what came in less what went out, and can be negative', () => {
    expect(kept(inAndOut(703_138, 563_957))).toBe(139_181);
    expect(kept(inAndOut(100_000, 192_300))).toBe(-92_300);
  });

  it.each([
    [8_500, 85, 'within'],
    [8_600, 86, 'tight'],
    [10_000, 100, 'tight'],
    [10_100, 101, 'over'],
  ] as const)('T12: %i cents out of 10,000 is %i% and "%s"', (outCents, pct, expected) => {
    const m = inAndOut(10_000, outCents);

    expect(spentPct(m)).toBe(pct);
    expect(status(m)).toBe(expected);
  });

  it.each([
    [8_549, 85, 'within'],
    [8_550, 86, 'tight'],
    [10_049, 100, 'tight'],
    [10_050, 101, 'over'],
  ] as const)('rounds %i of 10,000 to %i% before choosing "%s"', (outCents, pct, expected) => {
    const m = inAndOut(10_000, outCents);

    expect(spentPct(m)).toBe(pct);
    expect(status(m)).toBe(expected);
  });

  it('T11 (partial): March 2026 money out $7,480 vs money in is Over', () => {
    const march = month({
      paychecks: [pay(280_000, 280_000), pay(280_000, 280_000)],
      otherIncome: [{ amountCents: 60_000 }],
      bills: [bill(275_000)],
      cards: [card('Blue', 473_000)],
    });

    expect(moneyIn(march)).toBe(620_000);
    expect(moneyOut(march)).toBe(748_000);
    expect(kept(march)).toBe(-128_000);
    expect(spentPct(march)).toBe(121);
    expect(status(march)).toBe('over');
  });

  it('T11: with $357.00 moved to checking, March is $6,557 in, −$923 kept and Over at 114%', () => {
    const march = {
      ...inAndOut(620_000, 748_000),
      checkingMovedCents: 35_700,
    };

    expect(moneyIn(march)).toBe(655_700);
    expect(kept(march)).toBe(-92_300);
    expect(spentPct(march)).toBe(114);
    expect(status(march)).toBe('over');
  });

  it('has no spent % when nothing came in', () => {
    expect(spentPct(inAndOut(0, 5_000))).toBeNull();
    expect(spentPct(month())).toBeNull();
  });

  it('is Over when money went out and nothing came in', () => {
    expect(status(inAndOut(0, 1))).toBe('over');
  });

  it('is Within means when nothing came in and nothing went out', () => {
    expect(status(month())).toBe('within');
  });

  it('names the three statuses as the spec does', () => {
    expect(CASHFLOW_STATUS_LABELS).toEqual({
      within: 'Within means',
      tight: 'Tight',
      over: 'Over',
    });
  });
});
