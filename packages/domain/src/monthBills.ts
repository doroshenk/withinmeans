import { parseYm, type YearMonth } from './dates';
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

/**
 * Spec §5.11: one bill for each recurring bill active in `ym` (start and end months included), at
 * its estimate and due day.
 */
export function billsForMonth(
  recurring: readonly RecurringBillTemplate[],
  ym: YearMonth,
): MonthBill[] {
  parseYm(ym);
  // "YYYY-MM" strings sort in calendar order.
  return recurring
    .filter((r) => r.startYm <= ym && (r.endYm === null || ym <= r.endYm))
    .map((r) => ({
      recurringBillId: r.id,
      name: r.name,
      categoryId: r.categoryId,
      dueDate: `${ym}-${String(r.dueDay).padStart(2, '0')}`,
      estimateCents: r.estimateCents,
    }));
}
