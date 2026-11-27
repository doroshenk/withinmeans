import { z } from 'zod';
import type { MonthCashflow } from './cashflow';
import type { Week, YearMonth } from './dates';
import type { MonthBill, RecurringBillTemplate } from './monthBills';
import type { Cents } from './money';

export type BillKind = 'recurring' | 'one_time';

/** One month's bill as the page needs it. */
export interface BillLine {
  name: string;
  categoryId: string;
  /** "YYYY-MM-DD" */
  dueDate: string;
  estimateCents: Cents;
  /** Null until the real amount is known. */
  actualCents: Cents | null;
  paid: boolean;
  kind: BillKind;
}

export type BillWeekState = 'none' | 'paid' | 'partly' | 'to-pay';

export interface BillWeek<T extends BillLine = BillLine> {
  week: Week;
  /** "Nov 15 – 21" */
  range: string;
  bills: T[];
  totalCents: Cents;
  paidCount: number;
  leftCents: Cents;
  state: BillWeekState;
  isCurrent: boolean;
  /** Spec §6.2: the current and later weeks start open. */
  startsOpen: boolean;
}

export interface BillsMonthSummary {
  /** Paychecks and one-time income. */
  incomeCents: Cents;
  paychecksReceived: number;
  paycheckCount: number;
  otherCents: Cents;
  otherCount: number;
  checkingMovedCents: Cents;
  billsCents: Cents;
  cardsCents: Cents;
  outCents: Cents;
  paidCents: Cents;
  /** Paid so far as a whole-number percent of money out. */
  paidPct: number;
  paidCount: number;
  billCount: number;
  leftCents: Cents;
}

export interface BillCategoryTotal {
  /** Null for the credit cards line. */
  categoryId: string | null;
  name: string;
  colorIndex: number | null;
  cents: Cents;
  /** The bar's width next to the largest line. */
  barPct: number;
}

export interface BillDraftFields {
  name: string;
  amountText: string;
  /** "YYYY-MM-DD" from the date box; empty when not picked. */
  date: string;
  categoryId: string;
}

const notImplemented = (): never => {
  throw new Error('not implemented');
};

export function billWeeks<T extends BillLine>(
  _bills: readonly T[],
  _ym: YearMonth,
  _today: string,
): BillWeek<T>[] {
  return notImplemented();
}

export function billsMonthSummary(
  _month: Omit<MonthCashflow, 'bills'> & { bills: readonly BillLine[] },
): BillsMonthSummary {
  return notImplemented();
}

export function billCategoryTotals(
  _bills: readonly BillLine[],
  _categories: readonly { id: string; name: string; colorIndex: number }[],
  _cardsCents: Cents,
): { rows: BillCategoryTotal[]; oneTimeCents: Cents } {
  return notImplemented();
}

export function monthBillPreview(
  _recurring: readonly RecurringBillTemplate[],
  _ym: YearMonth,
  _today: string,
): MonthBill[] {
  return notImplemented();
}

export function canOpenMonth(_ym: YearMonth, _firstMonth: YearMonth, _today: string): boolean {
  return notImplemented();
}

export function oneTimeBillDraftError(_draft: BillDraftFields): string | undefined {
  return notImplemented();
}

export function billEditDraftError(
  _draft: BillDraftFields,
  _ym: YearMonth,
  _kind: BillKind = 'one_time',
): string | undefined {
  return notImplemented();
}

export const billsPageInput = z.object({});
export const openMonthInput = z.object({});
export const addBillInput = z.object({ name: z.string() });
export const updateBillInput = z.object({});
export const setBillPaidInput = z.object({});
export const removeBillInput = z.object({});
