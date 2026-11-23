import type { Clock } from '@withinmeans/domain';
import { Temporal } from 'temporal-polyfill';

/** The one place in the API that reads the real clock; domain code only ever receives it. */
export const systemClock: Clock = { now: () => Temporal.Instant.fromEpochMilliseconds(Date.now()) };
