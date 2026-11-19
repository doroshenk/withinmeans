import type { Temporal } from 'temporal-polyfill';

export type YearMonth = string;
export type Week = 1 | 2 | 3 | 4;

export function parseYm(_ym: YearMonth): { year: number; month: number } {
  throw new Error('not implemented');
}
export function addMonths(_ym: YearMonth, _n: number): YearMonth {
  throw new Error('not implemented');
}
export function monthOf(_date: Temporal.PlainDate): YearMonth {
  throw new Error('not implemented');
}
export function daysInMonth(_ym: YearMonth): number {
  throw new Error('not implemented');
}
export function week(_date: Temporal.PlainDate): Week {
  throw new Error('not implemented');
}
