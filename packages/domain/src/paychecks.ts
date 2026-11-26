import { Temporal } from 'temporal-polyfill';
import { z } from 'zod';
import { parseYm, type YearMonth } from './dates';
import { sumCents, type Cents } from './money';
import { paydaysForMonth, type PaySchedule } from './paydays';

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

/** A stored schedule's dates in the shape the payday rules take. */
export function paydaySchedule(
  s: Pick<PayScheduleTemplate, 'frequency' | 'anchorDate' | 'semimonthlyDays'>,
): PaySchedule {
  if (s.frequency === 'semimonthly') {
    return {
      frequency: s.frequency,
      ...(s.semimonthlyDays !== null && { days: s.semimonthlyDays }),
    };
  }
  return { frequency: s.frequency, anchorDate: Temporal.PlainDate.from(s.anchorDate) };
}

/**
 * Spec §5.9: the paychecks each schedule is expected to pay in `ym`, in date order. A stopped
 * schedule expects nothing after the day it was stopped.
 */
export function paychecksForMonth(
  schedules: readonly PayScheduleTemplate[],
  ym: YearMonth,
): ExpectedPaycheck[] {
  parseYm(ym);
  return schedules
    .flatMap((s) =>
      paydaysForMonth(paydaySchedule(s), ym)
        .map((date) => date.toString())
        // "YYYY-MM-DD" strings sort in calendar order.
        .filter((date) => s.endedOn === null || date <= s.endedOn)
        .map((expectedDate) => ({
          scheduleId: s.id,
          expectedDate,
          expectedCents: s.usualCents,
        })),
    )
    .sort((a, b) => a.expectedDate.localeCompare(b.expectedDate));
}

/** Spec §5.6: the received amount once there is one, else the expected amount; never both. */
export function paycheckCents(paycheck: PaycheckAmounts): Cents {
  return paycheck.receivedCents ?? paycheck.expectedCents;
}

export function paychecksTotalCents(paychecks: readonly PaycheckAmounts[]): Cents {
  return sumCents(paychecks.map(paycheckCents));
}

const payDay = z.number().int().min(1).max(31);
const positiveCents = z.number().int().positive();

/** $100,000,000: far above any real paycheck, and small enough that monthly totals stay exact. */
export const MAX_TAKE_HOME_CENTS = 10_000_000_000;

export const payScheduleFields = z.object({
  name: z.string().trim().min(1),
  frequency: z.enum(PAY_FREQUENCIES),
  anchorDate: z.iso.date(),
  semimonthlyDays: z.tuple([payDay, payDay]).optional(),
  usualCents: positiveCents.max(MAX_TAKE_HOME_CENTS),
  accountId: z.uuid().optional(),
});

/** Only twice-a-month pay has two days, and they differ. For `.refine(...)`. */
export const twoDaysRule = [
  ({
    frequency,
    semimonthlyDays,
  }: {
    frequency: PayFrequency;
    semimonthlyDays?: [number, number] | undefined;
  }): boolean =>
    semimonthlyDays === undefined ||
    (frequency === 'semimonthly' && semimonthlyDays[0] !== semimonthlyDays[1]),
  { path: ['semimonthlyDays'], message: 'Pick two different days, for semimonthly pay only.' },
] satisfies [unknown, unknown];

/** Spec §3 step 3: name, take-home > 0, a real date. */
export const addPayScheduleInput = payScheduleFields.refine(...twoDaysRule);

export const payScheduleIdInput = z.object({ id: z.uuid() });
export const monthPaychecksInput = z.object({
  ym: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
});
export const markPaycheckReceivedInput = z.object({
  id: z.uuid(),
  receivedCents: positiveCents.max(MAX_TAKE_HOME_CENTS),
  receivedDate: z.iso.date(),
});
