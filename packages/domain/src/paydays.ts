import type { Temporal } from 'temporal-polyfill';
import type { YearMonth } from './dates';

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

export function paydaysForMonth(_schedule: PaySchedule, _ym: YearMonth): Temporal.PlainDate[] {
  throw new Error('not implemented');
}

export function isThreePaydayMonth(_schedule: PaySchedule, _ym: YearMonth): boolean {
  throw new Error('not implemented');
}
