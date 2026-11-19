import type { Temporal } from 'temporal-polyfill';

/** Domain code never reads the system clock; callers inject one. */
export interface Clock {
  now(): Temporal.Instant;
}

export function fixedClock(instant: Temporal.Instant): Clock {
  return { now: () => instant };
}

/** "Today" as a calendar date in the household's time zone. */
export function today(clock: Clock, timeZone: string): Temporal.PlainDate {
  return clock.now().toZonedDateTimeISO(timeZone).toPlainDate();
}
