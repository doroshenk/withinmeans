import { Temporal } from 'temporal-polyfill';
import { addMonths, daysInMonth, parseYm, type YearMonth } from './dates';

export type PaySchedule =
  | {
      frequency: 'weekly' | 'biweekly' | 'monthly';
      /** Any real payday of the schedule. */
      anchorDate: Temporal.PlainDate;
    }
  | {
      frequency: 'semimonthly';
      /** The two days of the month, 1 to 31; the 1st and 15th when not given. */
      days?: readonly [number, number];
    };

const SEMIMONTHLY_DAYS = [1, 15] as const;
const SATURDAY = 6;

/** `day` of `ym`, or the month's last day when it is shorter. */
function dayOfMonth(ym: YearMonth, day: number): Temporal.PlainDate {
  const { year, month } = parseYm(ym);
  return Temporal.PlainDate.from({ year, month, day: Math.min(day, daysInMonth(ym)) });
}

/** Business days are Monday to Friday; holidays are not considered. */
function nextBusinessDay(date: Temporal.PlainDate): Temporal.PlainDate {
  // ISO day of week: Monday is 1, Sunday is 7.
  return date.dayOfWeek < SATURDAY ? date : date.add({ days: 8 - date.dayOfWeek });
}

/** Every `interval` days counted from the anchor, in both directions. */
function everyNDays(
  anchor: Temporal.PlainDate,
  interval: number,
  ym: YearMonth,
): Temporal.PlainDate[] {
  const first = dayOfMonth(ym, 1);
  // The remainder is negative when the anchor is before the month.
  const offset = ((first.until(anchor).days % interval) + interval) % interval;
  const paydays: Temporal.PlainDate[] = [];
  for (let day = 1 + offset; day <= first.daysInMonth; day += interval) {
    paydays.push(dayOfMonth(ym, day));
  }
  return paydays;
}

function semimonthly(days: readonly [number, number], ym: YearMonth): Temporal.PlainDate[] {
  const [first, second] = days;
  const valid = (day: number) => Number.isInteger(day) && day >= 1 && day <= 31;
  if (!valid(first) || !valid(second) || first === second) {
    throw new RangeError(
      `Invalid semimonthly days ${first} and ${second}, expected two different days 1-31`,
    );
  }
  const { month } = parseYm(ym);
  // A payday at the end of last month can move into this one.
  const paid = [addMonths(ym, -1), ym]
    .flatMap((m) => days.map((day) => nextBusinessDay(dayOfMonth(m, day))))
    .filter((date) => date.month === month)
    .sort(Temporal.PlainDate.compare);
  // Two days can resolve to one date, and a schedule is paid once on a date.
  return paid.filter((date, i) => !paid.slice(0, i).some((earlier) => earlier.equals(date)));
}

/**
 * Spec §5.9: the dates a schedule is expected to pay in `ym`, in order.
 *
 * - Weekly and biweekly: every 7 or 14 days from the anchor.
 * - Semimonthly: the two days, each moved to the next business day.
 * - Monthly: the anchor's day of month, not moved off weekends.
 *
 * A day the month doesn't have becomes its last day.
 */
export function paydaysForMonth(schedule: PaySchedule, ym: YearMonth): Temporal.PlainDate[] {
  switch (schedule.frequency) {
    case 'weekly':
      return everyNDays(schedule.anchorDate, 7, ym);
    case 'biweekly':
      return everyNDays(schedule.anchorDate, 14, ym);
    case 'semimonthly':
      return semimonthly(schedule.days ?? SEMIMONTHLY_DAYS, ym);
    case 'monthly':
      return [dayOfMonth(ym, schedule.anchorDate.day)];
  }
}

/** Whether `ym` gets the "3 paydays" note: a biweekly schedule paying three times. */
export function isThreePaydayMonth(schedule: PaySchedule, ym: YearMonth): boolean {
  return schedule.frequency === 'biweekly' && paydaysForMonth(schedule, ym).length === 3;
}
