import { z } from 'zod';
import type { YearMonth } from './dates';
import type { Cents } from './money';

export const PAY_FREQUENCIES = ['weekly', 'biweekly', 'semimonthly', 'monthly'] as const;
export type PayFrequency = (typeof PAY_FREQUENCIES)[number];

/** What a pay schedule needs to say to make a month's expected paychecks. */
export interface PayScheduleTemplate {
  id: string;
  frequency: PayFrequency;
  /** "YYYY-MM-DD", any real payday of the schedule. */
  anchorDate: string;
  /** Semimonthly only; null means the 1st and 15th. */
  semimonthlyDays: readonly [number, number] | null;
  usualCents: Cents;
  /** "YYYY-MM-DD": the day the schedule was stopped; null while it runs. */
  endedOn: string | null;
}

export interface ExpectedPaycheck {
  scheduleId: string;
  /** "YYYY-MM-DD" */
  expectedDate: string;
  expectedCents: Cents;
}

export interface PaycheckAmounts {
  expectedCents: Cents;
  /** Null until the paycheck is marked received. */
  receivedCents: Cents | null;
}

export function paychecksForMonth(
  _schedules: readonly PayScheduleTemplate[],
  _ym: YearMonth,
): ExpectedPaycheck[] {
  throw new Error('not implemented');
}

export function paycheckCents(_paycheck: PaycheckAmounts): Cents {
  throw new Error('not implemented');
}

export function paychecksTotalCents(_paychecks: readonly PaycheckAmounts[]): Cents {
  throw new Error('not implemented');
}

export const addPayScheduleInput = z.never();
export const payScheduleIdInput = z.never();
export const monthPaychecksInput = z.never();
export const markPaycheckReceivedInput = z.never();
