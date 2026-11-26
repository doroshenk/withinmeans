import { Temporal } from 'temporal-polyfill';

/** A calendar month as `"YYYY-MM"`. */
export type YearMonth = string;
export type Week = 1 | 2 | 3 | 4;

const YM = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function parseYm(ym: YearMonth): { year: number; month: number } {
  const match = YM.exec(ym);
  if (!match) throw new RangeError(`Invalid year-month "${ym}", expected YYYY-MM`);
  return { year: Number(match[1]), month: Number(match[2]) };
}

export function addMonths(ym: YearMonth, n: number): YearMonth {
  if (!Number.isInteger(n)) throw new RangeError(`Month count must be an integer, got ${n}`);
  const { year, month } = parseYm(ym);
  const total = year * 12 + (month - 1) + n;
  const newYear = Math.floor(total / 12);
  const newMonth = total - newYear * 12 + 1;
  return `${String(newYear).padStart(4, '0')}-${String(newMonth).padStart(2, '0')}`;
}

export function monthOf(date: Temporal.PlainDate): YearMonth {
  return date.toPlainYearMonth().toString();
}

export function daysInMonth(ym: YearMonth): number {
  const { year, month } = parseYm(ym);
  return Temporal.PlainYearMonth.from({ year, month }).daysInMonth;
}

/** Spec §5.1: days 1–7 → 1, 8–14 → 2, 15–21 → 3, day 22 to month end → 4. */
export function week(date: Temporal.PlainDate): Week {
  if (date.day <= 7) return 1;
  if (date.day <= 14) return 2;
  if (date.day <= 21) return 3;
  return 4;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** "Nov 18" from "2026-11-18". */
export function formatMonthDay(date: string): string {
  const { month, day } = Temporal.PlainDate.from(date);
  return `${SHORT_MONTHS[month - 1]} ${day}`;
}

/** "Wed, Nov 18" from "2026-11-18". */
export function formatShortDate(date: string): string {
  const { dayOfWeek, month, day } = Temporal.PlainDate.from(date);
  return `${WEEKDAYS[dayOfWeek - 1]}, ${SHORT_MONTHS[month - 1]} ${day}`;
}
