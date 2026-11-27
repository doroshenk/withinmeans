import { describe, expect, it } from 'vitest';
import {
  reinvestSuggestion,
  suggestionText,
  type ReinvestBucket,
  type ReinvestHolding,
} from './reinvest';

const holding = (
  ticker: string,
  payFrequency: ReinvestHolding['payFrequency'],
  priceCents: number,
): ReinvestHolding => ({ ticker, payFrequency, priceCents });

/** The spec §10 holdings, deliberately not in price order. */
const SEED: ReinvestHolding[] = [
  holding('STRC', 'daily', 9_840),
  holding('QDTE', 'weekly', 3_120),
  holding('YMAX', 'weekly', 1_385),
  holding('XDTE', 'weekly', 4_110),
  holding('BTCI', 'monthly', 2_452),
  holding('EGGY', 'monthly', 2_095),
  holding('CONY', 'monthly', 780),
  holding('JEPQ', 'monthly', 5_740),
];

const suggest = (bucket: ReinvestBucket, cashCents: number, holdings = SEED) =>
  reinvestSuggestion(bucket, holdings, cashCents);

const monthly = (cashCents: number, prices: Record<string, number>) =>
  suggest(
    'reinvest_monthly',
    cashCents,
    Object.entries(prices).map(([ticker, price]) => holding(ticker, 'monthly', price)),
  );

/** "TICKER×shares" in the order the suggestion lists them. */
const counts = (s: ReturnType<typeof reinvestSuggestion>) =>
  s.buys.map((b) => `${b.ticker}×${b.shares}`);

const NONE = 'Not enough for a share; carries over';

describe('P3-07 reinvest buy suggestions (spec §5.5)', () => {
  it('T5: reinvest weekly $14.20 → "Buy 1 YMAX = $13.85 · $0.35 stays"', () => {
    const s = suggest('reinvest_weekly', 1_420);

    expect(suggestionText(s)).toBe('Buy 1 YMAX = $13.85 · $0.35 stays');
    expect(s).toEqual({
      buys: [{ ticker: 'YMAX', shares: 1, priceCents: 1_385 }],
      totalCents: 1_385,
      staysCents: 35,
      eligibleCount: 4,
    });
  });

  it('T6: reinvest monthly $140.25 → "Buy 1 JEPQ, 1 BTCI, 1 EGGY, 4 CONY = $134.07 · $6.18 stays (4 of 4 tickers · 7 shares)"', () => {
    const s = suggest('reinvest_monthly', 14_025);

    expect(suggestionText(s)).toBe(
      'Buy 1 JEPQ, 1 BTCI, 1 EGGY, 4 CONY = $134.07 · $6.18 stays (4 of 4 tickers · 7 shares)',
    );
    expect(s.totalCents).toBe(13_407);
    expect(s.staysCents).toBe(618);
  });

  it('draws weekly buys from daily and weekly payers only', () => {
    const s = suggest('reinvest_weekly', 100_000);

    expect(s.buys.map((b) => b.ticker).sort()).toEqual(['QDTE', 'STRC', 'XDTE', 'YMAX']);
    expect(s.eligibleCount).toBe(4);
  });

  it('draws monthly buys from monthly payers only', () => {
    const s = suggest('reinvest_monthly', 100_000);

    expect(s.buys.map((b) => b.ticker).sort()).toEqual(['BTCI', 'CONY', 'EGGY', 'JEPQ']);
  });

  it('never suggests a holding that pays nothing', () => {
    const holdings = [holding('GROW', 'none', 100), holding('YMAX', 'weekly', 1_385)];

    for (const bucket of ['reinvest_weekly', 'reinvest_monthly'] as const) {
      expect(suggest(bucket, 10_000, holdings).buys.map((b) => b.ticker)).not.toContain('GROW');
    }
  });

  it('P3-07: no affordable ticker → "Not enough for a share; carries over"', () => {
    const s = suggest('reinvest_monthly', 779);

    expect(s).toEqual({ buys: [], totalCents: 0, staysCents: 779, eligibleCount: 4 });
    expect(suggestionText(s)).toBe(NONE);
  });

  it('P3-07: zero-price holdings are ignored', () => {
    const holdings = [holding('FREE', 'monthly', 0), holding('CONY', 'monthly', 780)];

    const s = suggest('reinvest_monthly', 800, holdings);

    expect(counts(s)).toEqual(['CONY×1']);
    expect(s.eligibleCount).toBe(1);
  });

  it.each([0, -500])('buys nothing with %i cents', (cashCents) => {
    const s = suggest('reinvest_monthly', cashCents);

    expect(s.buys).toEqual([]);
    expect(s.totalCents).toBe(0);
    expect(s.staysCents).toBe(cashCents);
    expect(suggestionText(s)).toBe(NONE);
  });

  it('buys nothing when there are no eligible holdings', () => {
    expect(suggest('reinvest_weekly', 10_000, [])).toEqual({
      buys: [],
      totalCents: 0,
      staysCents: 10_000,
      eligibleCount: 0,
    });
  });

  it('buys a share that costs exactly the cash', () => {
    const s = monthly(780, { CONY: 780 });

    expect(counts(s)).toEqual(['CONY×1']);
    expect(suggestionText(s)).toBe('Buy 1 CONY = $7.80 · $0.00 stays');
  });

  it('prefers more tickers to more shares: one of each, cheapest first', () => {
    const s = monthly(600, { AAA: 100, BBB: 200, CCC: 300 });

    expect(counts(s)).toEqual(['CCC×1', 'BBB×1', 'AAA×1']);
    expect(s.staysCents).toBe(0);
  });

  it('skips the tickers it cannot afford and puts the rest into the cheapest', () => {
    const s = monthly(450, { AAA: 100, BBB: 200, CCC: 300 });

    expect(counts(s)).toEqual(['BBB×1', 'AAA×2']);
    expect(s.staysCents).toBe(50);
    expect(s.eligibleCount).toBe(3);
  });

  it('upgrades a cheapest share when the difference exactly fits', () => {
    // One of each (400) + 2 more AAA (200) leaves 20; AAA → BBB costs exactly 20.
    const s = monthly(620, { AAA: 100, BBB: 120, CCC: 180 });

    expect(counts(s)).toEqual(['CCC×1', 'BBB×2', 'AAA×2']);
    expect(s.staysCents).toBe(0);
  });

  it('upgrades by the largest difference that fits first', () => {
    // One of each (430) + 3 more AAA leaves 90; the +80 swap beats the +50 one.
    const s = monthly(820, { AAA: 100, BBB: 150, CCC: 180 });

    expect(counts(s)).toEqual(['CCC×2', 'BBB×1', 'AAA×3']);
    expect(s.totalCents).toBe(810);
    expect(s.staysCents).toBe(10);
  });

  it('keeps upgrading until the cheapest is down to one share', () => {
    // One of each (201) + 2 more AAA leaves 99; each swap costs 1.
    const s = monthly(500, { AAA: 100, BBB: 101 });

    expect(counts(s)).toEqual(['BBB×3', 'AAA×1']);
    expect(s.totalCents).toBe(403);
    expect(s.staysCents).toBe(97);
  });

  it('moves on to a smaller difference once the largest no longer fits', () => {
    // One of each (360) + 5 more AAA leaves 65: one +50 swap, then one +10 swap.
    const s = monthly(925, { AAA: 100, BBB: 110, CCC: 150 });

    expect(counts(s)).toEqual(['CCC×2', 'BBB×2', 'AAA×4']);
    expect(s.staysCents).toBe(5);
  });

  it('does not swap between equally priced tickers', () => {
    const s = monthly(450, { BBB: 100, AAA: 100 });

    expect(counts(s)).toEqual(['BBB×1', 'AAA×3']);
    expect(s.staysCents).toBe(50);
  });

  it('breaks price ties by ticker, whatever order the holdings arrive in', () => {
    const forward = monthly(250, { AAA: 100, BBB: 100 });
    const backward = monthly(250, { BBB: 100, AAA: 100 });

    expect(backward).toEqual(forward);
    expect(counts(monthly(100, { BBB: 100, AAA: 100 }))).toEqual(['AAA×1']);
  });

  it('handles a very large amount of cash at once', () => {
    const s = monthly(10_000_000_000, { AAA: 1, BBB: 3 });

    expect(s.totalCents).toBe(10_000_000_000);
    expect(s.staysCents).toBe(0);
    expect(counts(s)).toEqual(['BBB×1', 'AAA×9999999997']);
  });

  it('shows the counts only when two or more tickers are bought', () => {
    expect(suggestionText(monthly(250, { AAA: 100, BBB: 500 }))).toBe(
      'Buy 2 AAA = $2.00 · $0.50 stays',
    );
    expect(suggestionText(monthly(300, { AAA: 100, BBB: 200, CCC: 900 }))).toBe(
      'Buy 1 BBB, 1 AAA = $3.00 · $0.00 stays (2 of 3 tickers · 2 shares)',
    );
  });

  it('leaves the holdings it was given untouched', () => {
    const holdings = SEED.map((h) => Object.freeze({ ...h }));
    Object.freeze(holdings);

    expect(() => suggest('reinvest_monthly', 14_025, holdings)).not.toThrow();
    expect(holdings.map((h) => h.ticker)).toEqual(SEED.map((h) => h.ticker));
  });

  it('needs whole cents', () => {
    expect(() => suggest('reinvest_monthly', 1.5)).toThrow(/cash must be an integer/);
    expect(() => monthly(100, { AAA: 1.5 })).toThrow(/AAA price must be an integer/);
  });
});
