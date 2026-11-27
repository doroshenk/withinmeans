import { assertCents, formatMoney, subCents, wholeTimes, type Cents } from './money';

export type HoldingPayFrequency = 'daily' | 'weekly' | 'monthly' | 'none';
export type ReinvestBucket = 'reinvest_weekly' | 'reinvest_monthly';

/** Spec §5.5: the pay frequencies each bucket buys from. */
const BUCKET_FREQUENCIES: Record<ReinvestBucket, readonly HoldingPayFrequency[]> = {
  reinvest_weekly: ['daily', 'weekly'],
  reinvest_monthly: ['monthly'],
};

/** What a suggestion needs to know about a holding. */
export interface ReinvestHolding {
  ticker: string;
  payFrequency: HoldingPayFrequency;
  priceCents: Cents;
}

export interface ReinvestBuy {
  ticker: string;
  shares: number;
  priceCents: Cents;
}

export interface ReinvestSuggestion {
  /** Dearest first, as the suggestion reads. Empty when nothing is affordable. */
  buys: ReinvestBuy[];
  totalCents: Cents;
  /** The cash left over, which carries over. */
  staysCents: Cents;
  /** How many holdings the bucket could buy from. */
  eligibleCount: number;
}

/**
 * Spec §5.5: as many different tickers as the cash allows, then as many shares. It only suggests;
 * holdings never change here.
 */
export function reinvestSuggestion(
  bucket: ReinvestBucket,
  holdings: readonly ReinvestHolding[],
  cashCents: Cents,
): ReinvestSuggestion {
  assertCents(cashCents, 'cash');
  for (const { ticker, priceCents } of holdings) assertCents(priceCents, `${ticker} price`);
  const eligible = holdings
    .filter((h) => BUCKET_FREQUENCIES[bucket].includes(h.payFrequency) && h.priceCents > 0)
    .sort((a, b) => a.priceCents - b.priceCents || a.ticker.localeCompare(b.ticker));

  // Variety: one of each, cheapest first. Once one is too dear, so are the rest.
  const buys: ReinvestBuy[] = [];
  let remainingCents = cashCents;
  for (const { ticker, priceCents } of eligible) {
    if (priceCents > remainingCents) break;
    buys.push({ ticker, shares: 1, priceCents });
    remainingCents = subCents(remainingCents, priceCents);
  }

  const [cheapest, ...others] = buys;
  if (cheapest) {
    // Volume: the rest goes into more of the cheapest.
    const extra = wholeTimes(remainingCents, cheapest.priceCents);
    cheapest.shares += extra;
    remainingCents = subCents(remainingCents, extra * cheapest.priceCents);
    remainingCents = upgrade(cheapest, others, remainingCents);
  }

  return {
    buys: buys.reverse(),
    totalCents: subCents(cashCents, remainingCents),
    staysCents: remainingCents,
    eligibleCount: eligible.length,
  };
}

/**
 * Spec §5.5 step 3: swaps cheapest shares, one at a time, for the dearest ticker already bought
 * whose price difference still fits. Equal prices are not swapped, as nothing would be gained.
 * Changes the share counts and returns the cash left. `others` is in ascending price order.
 */
function upgrade(cheapest: ReinvestBuy, others: ReinvestBuy[], cashCents: Cents): Cents {
  const dearestFirst = [...others].reverse();
  let remainingCents = cashCents;
  while (cheapest.shares > 1) {
    const target = dearestFirst.find((buy) => {
      const extraCents = subCents(buy.priceCents, cheapest.priceCents);
      return extraCents > 0 && extraCents <= remainingCents;
    });
    if (!target) break;
    cheapest.shares -= 1;
    target.shares += 1;
    remainingCents = subCents(remainingCents, subCents(target.priceCents, cheapest.priceCents));
  }
  return remainingCents;
}

/** The suggestion in words; the counts appear once two or more tickers are bought. */
export function suggestionText(suggestion: ReinvestSuggestion): string {
  const { buys, totalCents, staysCents, eligibleCount } = suggestion;
  if (buys.length === 0) return 'Not enough for a share; carries over';
  const list = buys.map((buy) => `${buy.shares} ${buy.ticker}`).join(', ');
  const text = `Buy ${list} = ${formatMoney(totalCents)} · ${formatMoney(staysCents)} stays`;
  if (buys.length < 2) return text;
  const shares = buys.reduce((sum, buy) => sum + buy.shares, 0);
  return `${text} (${buys.length} of ${eligibleCount} tickers · ${shares} shares)`;
}
