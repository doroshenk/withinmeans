import type { Temporal } from 'temporal-polyfill';

export interface Clock {
  now(): Temporal.Instant;
}

export function fixedClock(_instant: Temporal.Instant): Clock {
  throw new Error('not implemented');
}
export function today(_clock: Clock, _timeZone: string): Temporal.PlainDate {
  throw new Error('not implemented');
}
