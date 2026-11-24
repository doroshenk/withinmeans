import { z } from 'zod';
import type { Temporal } from 'temporal-polyfill';
import { addMonths, monthOf, parseYm, type YearMonth } from './dates';

export type FirstMonthChoice = 'this' | 'next';

/** The input of "start the first month" (spec §3 step 1). */
export const startFirstMonthInput = z.object({ choice: z.enum(['this', 'next']) });

/** Spec §3 step 1: "this month" (catch up from the 1st) or "next month" (start fresh). */
export function firstMonthFor(choice: FirstMonthChoice, today: Temporal.PlainDate): YearMonth {
  const thisMonth = monthOf(today);
  return choice === 'this' ? thisMonth : addMonths(thisMonth, 1);
}

export function firstMonthOptions(today: Temporal.PlainDate): {
  thisMonth: YearMonth;
  nextMonth: YearMonth;
} {
  return { thisMonth: firstMonthFor('this', today), nextMonth: firstMonthFor('next', today) };
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** "2026-11" → "November 2026". */
export function monthLabel(ym: YearMonth): string {
  const { year, month } = parseYm(ym);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}
