import { type Cents } from './money';

export type HoldingPayFrequency = 'daily' | 'weekly' | 'monthly' | 'none';
export type ReinvestBucket = 'reinvest_weekly' | 'reinvest_monthly';

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

export function reinvestSuggestion(
  _bucket: ReinvestBucket,
  _holdings: readonly ReinvestHolding[],
  _cashCents: Cents,
): ReinvestSuggestion {
  throw new Error('not implemented');
}

export function suggestionText(_suggestion: ReinvestSuggestion): string {
  throw new Error('not implemented');
}
