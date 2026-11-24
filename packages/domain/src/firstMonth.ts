import { z } from 'zod';
import type { Temporal } from 'temporal-polyfill';
import type { YearMonth } from './dates';

export type FirstMonthChoice = 'this' | 'next';

/** The input of "start the first month" (spec §3 step 1). */
export const startFirstMonthInput = z.object({ choice: z.enum(['this', 'next']) });

/** Spec §3 step 1: "this month" (catch up from the 1st) or "next month" (start fresh). */
export function firstMonthFor(_choice: FirstMonthChoice, _today: Temporal.PlainDate): YearMonth {
  throw new Error('not implemented');
}

export function firstMonthOptions(_today: Temporal.PlainDate): {
  thisMonth: YearMonth;
  nextMonth: YearMonth;
} {
  throw new Error('not implemented');
}

/** "2026-11" → "November 2026". */
export function monthLabel(_ym: YearMonth): string {
  throw new Error('not implemented');
}
