import { percentOf, subCents, sumCents, type Cents } from './money';
import { otherIncomeTotalCents } from './otherIncome';
import { paychecksTotalCents, type PaycheckAmounts } from './paychecks';

export type CashflowStatus = 'within' | 'tight' | 'over';

export const CASHFLOW_STATUS_LABELS: Record<CashflowStatus, string> = {
  within: 'Within means',
  tight: 'Tight',
  over: 'Over',
};

/** The highest spent % of each status; anything above "tight" is over. */
const WITHIN_MAX_PCT = 85;
const TIGHT_MAX_PCT = 100;

/** One credit card in one month. */
export interface CardMonth {
  cardId: string;
  name: string;
  /** Null when no statement has been entered for the month. */
  plannedPaymentCents: Cents | null;
}

/** One month's records; the caller picks the month. */
export interface MonthCashflow {
  paychecks: readonly PaycheckAmounts[];
  otherIncome: readonly { amountCents: Cents }[];
  bills: readonly { estimateCents: Cents; actualCents: Cents | null }[];
  cards: readonly CardMonth[];
  /** Investment income actually moved to checking; none until money moves exist. */
  checkingMovedCents?: Cents;
}

/** Spec §5.6: paychecks, one-time income and the investment income moved to checking. */
export function moneyIn(month: MonthCashflow): Cents {
  return sumCents([
    paychecksTotalCents(month.paychecks),
    otherIncomeTotalCents(month.otherIncome),
    month.checkingMovedCents ?? 0,
  ]);
}

/**
 * Spec §5.6: each bill's actual amount, or its estimate until there is one, plus the planned card
 * payments. A card with no statement counts $0.
 */
export function moneyOut(month: MonthCashflow): Cents {
  return sumCents([
    ...month.bills.map((bill) => bill.actualCents ?? bill.estimateCents),
    ...month.cards.map((card) => card.plannedPaymentCents ?? 0),
  ]);
}

/** Spec §5.6: money in less money out. */
export function kept(month: MonthCashflow): Cents {
  return subCents(moneyIn(month), moneyOut(month));
}

/** Spec §5.6: money out as a whole-number percent of money in; null when nothing came in. */
export function spentPct(month: MonthCashflow): number | null {
  const inCents = moneyIn(month);
  return inCents > 0 ? percentOf(moneyOut(month), inCents) : null;
}

/**
 * Spec §5.6. With no money in there is no spent %: a month that spent nothing is within means, and
 * one that spent anything is over.
 */
export function status(month: MonthCashflow): CashflowStatus {
  const pct = spentPct(month);
  if (pct === null) return moneyOut(month) > 0 ? 'over' : 'within';
  if (pct <= WITHIN_MAX_PCT) return 'within';
  return pct <= TIGHT_MAX_PCT ? 'tight' : 'over';
}

/** Spec §5.6: the cards still waiting for the month's statement. */
export function missingCards<T extends CardMonth>(cards: readonly T[]): T[] {
  return cards.filter((card) => card.plannedPaymentCents === null);
}
