import type { YearMonth } from './dates';
import type { Cents } from './money';

/** What a recurring bill needs to say to make a month's bill. */
export interface RecurringBillTemplate {
  id: string;
  name: string;
  estimateCents: Cents;
  /** 1 to 28, so every month has it. */
  dueDay: number;
  categoryId: string;
  startYm: YearMonth;
  /** The last month the bill is active; null while it has no end. */
  endYm: YearMonth | null;
}

export interface MonthBill {
  recurringBillId: string;
  name: string;
  categoryId: string;
  /** "YYYY-MM-DD" */
  dueDate: string;
  estimateCents: Cents;
}

export function billsForMonth(
  _recurring: readonly RecurringBillTemplate[],
  _ym: YearMonth,
): MonthBill[] {
  throw new Error('not implemented');
}
