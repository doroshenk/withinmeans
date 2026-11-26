import { Temporal } from 'temporal-polyfill';
import { z } from 'zod';
import { parseDollars } from './accounts';
import { addMonths, formatMonthDay, monthOf, parseYm, type YearMonth } from './dates';
import { averageCents, formatMoney, subCents, sumCents, type Cents } from './money';
import { otherIncomeTotalCents } from './otherIncome';
import {
  MAX_TAKE_HOME_CENTS,
  payScheduleFields,
  payScheduleIdInput,
  paychecksForMonth,
  paychecksTotalCents,
  paydaySchedule,
  twoDaysRule,
  type ExpectedPaycheck,
  type PayFrequency,
  type PaycheckAmounts,
  type PayScheduleTemplate,
} from './paychecks';
import { isThreePaydayMonth, paydaysForMonth } from './paydays';
import { isPayDate } from './paySetup';

export interface PaycheckMonthSummary {
  /** Paychecks marked received, plus one-time income. */
  receivedCents: Cents;
  stillExpectedCents: Cents;
  toComeCount: number;
  /** The actual amount of each received paycheck and the expected amount of the rest. */
  paychecksCents: Cents;
  paycheckCount: number;
  otherCents: Cents;
  otherCount: number;
}

/** Spec §6.4: the four tiles at the top of the Paychecks page. */
export function paycheckMonthSummary(
  paychecks: readonly PaycheckAmounts[],
  otherIncome: readonly { amountCents: Cents }[],
): PaycheckMonthSummary {
  const received = paychecks.filter((p) => p.receivedCents !== null);
  const toCome = paychecks.filter((p) => p.receivedCents === null);
  const otherCents = otherIncomeTotalCents(otherIncome);
  return {
    receivedCents: sumCents([paychecksTotalCents(received), otherCents]),
    stillExpectedCents: paychecksTotalCents(toCome),
    toComeCount: toCome.length,
    paychecksCents: paychecksTotalCents(paychecks),
    paycheckCount: paychecks.length,
    otherCents,
    otherCount: otherIncome.length,
  };
}

/** The number of paychecks in a schedule's "Average of last 6". */
export const AVERAGE_PAYCHECKS = 6;

/** The average of the paychecks received most recently; null before the first. */
export function averageReceivedCents(
  paychecks: readonly { receivedDate: string | null; receivedCents: Cents | null }[],
): Cents | null {
  const latest = paychecks
    .flatMap(({ receivedDate, receivedCents }) =>
      receivedDate === null || receivedCents === null ? [] : [{ receivedDate, receivedCents }],
    )
    // "YYYY-MM-DD" strings sort in calendar order.
    .sort((a, b) => b.receivedDate.localeCompare(a.receivedDate))
    .slice(0, AVERAGE_PAYCHECKS);
  return averageCents(latest.map((p) => p.receivedCents));
}

/** "+$47.18 vs expected" on a received paycheck. */
export function receivedDifferenceText(receivedCents: Cents, expectedCents: Cents): string {
  const difference = subCents(receivedCents, expectedCents);
  if (difference === 0) return 'Same as expected';
  return `${difference > 0 ? '+' : ''}${formatMoney(difference)} vs expected`;
}

/** The line under the "received" form while the amount is typed; null until it is an amount. */
export function receivedPreviewText(amountText: string, expectedCents: Cents): string | null {
  const receivedCents = parseDollars(amountText) ?? 0;
  if (receivedCents <= 0) return null;
  if (receivedCents === expectedCents) return 'Same as expected.';
  const more = receivedCents > expectedCents;
  const difference = more
    ? subCents(receivedCents, expectedCents)
    : subCents(expectedCents, receivedCents);
  return `${formatMoney(difference)} ${more ? 'more' : 'less'} than expected.`;
}

/** "Expected in 2 days" on a paycheck not received yet. */
export function expectedWhenText(expectedDate: string, today: string): string {
  const days = Temporal.PlainDate.from(today).until(expectedDate).days;
  if (days < 0) return `Was expected ${formatMonthDay(expectedDate)}`;
  if (days === 0) return 'Expected today';
  if (days === 1) return 'Expected tomorrow';
  return `Expected in ${days} days`;
}

/** What is wrong with the "received" form, if anything. */
export function receivedDraftError(draft: {
  amountText: string;
  date: string;
}): string | undefined {
  const amountCents = parseDollars(draft.amountText) ?? 0;
  if (amountCents <= 0) return 'Enter the amount that landed, above $0.';
  if (amountCents > MAX_TAKE_HOME_CENTS) return 'Enter an amount of $100,000,000 or less.';
  if (!isPayDate(draft.date)) return 'Pick the date it was received.';
  return undefined;
}

const MONTHS_AHEAD = 12;

/** The first month from `from` on in which a running schedule pays three times, within a year. */
export function nextThreePaydayMonth(
  schedule: PayScheduleTemplate,
  from: YearMonth,
): YearMonth | null {
  if (schedule.endedOn !== null) return null;
  const days = paydaySchedule(schedule);
  for (let ahead = 0; ahead < MONTHS_AHEAD; ahead += 1) {
    const ym = addMonths(from, ahead);
    if (isThreePaydayMonth(days, ym)) return ym;
  }
  return null;
}

/**
 * Spec §5.11: what a month not started yet will expect, from the running schedules. A past month
 * that was never started has nothing to preview.
 */
export function monthPaycheckPreview(
  schedules: readonly PayScheduleTemplate[],
  ym: YearMonth,
  today: string,
): ExpectedPaycheck[] {
  parseYm(ym);
  if (ym < monthOf(Temporal.PlainDate.from(today))) return [];
  return paychecksForMonth(
    schedules.filter((s) => s.endedOn === null),
    ym,
  );
}

/**
 * The first payday an edited schedule may change: today, or the day after the latest payday already
 * received if that is later, so no second paycheck appears beside one received early.
 */
export function firstRegeneratedPayday(today: string, received: readonly string[]): string {
  const after = received.map((date) => Temporal.PlainDate.from(date).add({ days: 1 }).toString());
  // "YYYY-MM-DD" strings sort in calendar order.
  return after.reduce((latest, date) => (date > latest ? date : latest), today);
}

/** Half a pay period, in days: closer than this, two paydays pay for the same period. */
const HALF_PERIOD_DAYS: Record<PayFrequency, number> = {
  weekly: 4,
  biweekly: 7,
  semimonthly: 7,
  monthly: 15,
};

/**
 * Of `paydays`, those no received paycheck already pays for. Only a received paycheck dated off the
 * schedule (its payday moved after the money arrived) stands for a payday near it; one on the
 * schedule covers just its own date.
 */
export function uncoveredPaydays(
  schedule: Pick<PayScheduleTemplate, 'frequency' | 'anchorDate' | 'semimonthlyDays'>,
  paydays: readonly string[],
  received: readonly string[],
): string[] {
  const days = paydaySchedule(schedule);
  const moved = received.filter((date) =>
    paydaysForMonth(days, monthOf(Temporal.PlainDate.from(date))).every(
      (payday) => payday.toString() !== date,
    ),
  );
  const half = HALF_PERIOD_DAYS[schedule.frequency];
  return paydays.filter((payday) =>
    moved.every((date) => Math.abs(Temporal.PlainDate.from(date).until(payday).days) >= half),
  );
}

/** Spec §6.4 "edit": the same checks as adding a schedule. */
export const updatePayScheduleInput = payScheduleFields
  .extend(payScheduleIdInput.shape)
  .refine(...twoDaysRule);

export const paycheckIdInput = z.object({ id: z.uuid() });

export const paychecksPageInput = z.object({
  ym: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
});
