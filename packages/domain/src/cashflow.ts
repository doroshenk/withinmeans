import type { Cents } from './money';
import type { PaycheckAmounts } from './paychecks';

export type CashflowStatus = 'within' | 'tight' | 'over';

export const CASHFLOW_STATUS_LABELS = {} as Record<CashflowStatus, string>;

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

export function moneyIn(_month: MonthCashflow): Cents {
  throw new Error('not implemented');
}

export function moneyOut(_month: MonthCashflow): Cents {
  throw new Error('not implemented');
}

export function kept(_month: MonthCashflow): Cents {
  throw new Error('not implemented');
}

export function spentPct(_month: MonthCashflow): number | null {
  throw new Error('not implemented');
}

export function status(_month: MonthCashflow): CashflowStatus {
  throw new Error('not implemented');
}

export function missingCards<T extends CardMonth>(_cards: readonly T[]): T[] {
  throw new Error('not implemented');
}
