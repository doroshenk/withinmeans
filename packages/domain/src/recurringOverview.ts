import type { Week, YearMonth } from './dates';
import type { Cents } from './money';

/** A recurring bill as the Recurring bills page needs it. */
export interface RecurringBillItem {
  id: string;
  name: string;
  estimateCents: Cents;
  dueDay: number;
  categoryId: string;
  autopay: boolean;
  startYm: YearMonth;
  /** The last month the bill is active; null while it has not ended. */
  endYm: YearMonth | null;
}

export interface UpcomingBill extends RecurringBillItem {
  /** "YYYY-MM-DD", today or later. */
  nextDue: string;
  daysUntil: number;
}

export interface WeekOfBills {
  week: Week;
  totalCents: Cents;
  /** The total as a percent of the biggest week's total (the bar's length). */
  barPercent: number;
  bills: UpcomingBill[];
}

export interface RecurringOverview {
  totalCents: Cents;
  count: number;
  autopayCount: number;
  manualCount: number;
  /** Bills that have not ended, next due first. */
  active: UpcomingBill[];
  ended: RecurringBillItem[];
  nextUp: UpcomingBill | null;
  weeks: WeekOfBills[];
}

export type RecurringSort = 'next-due' | 'amount' | 'name';

export interface CategoryTotal {
  count: number;
  totalCents: Cents;
}

export function nextDueDate(
  _bill: Pick<RecurringBillItem, 'dueDay' | 'startYm'>,
  _today: string,
): string {
  throw new Error('not implemented');
}

export function dueInText(_daysUntil: number): { text: string; soon: boolean } {
  throw new Error('not implemented');
}

export function recurringOverview(
  _bills: readonly RecurringBillItem[],
  _today: string,
): RecurringOverview {
  throw new Error('not implemented');
}

export function sortRecurring(_bills: readonly UpcomingBill[], _by: RecurringSort): UpcomingBill[] {
  throw new Error('not implemented');
}

export function categoryTotals(
  _bills: readonly RecurringBillItem[],
): ReadonlyMap<string, CategoryTotal> {
  throw new Error('not implemented');
}

export function lastKeptMonth(
  _openedMonths: readonly YearMonth[],
  _currentYm: YearMonth,
): YearMonth {
  throw new Error('not implemented');
}

export function newBillStartMonth(_firstMonth: YearMonth, _currentYm: YearMonth): YearMonth {
  throw new Error('not implemented');
}
