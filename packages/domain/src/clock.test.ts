import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import { fixedClock, today } from './clock';

describe('today', () => {
  it("today(clock, 'America/New_York') at 2026-12-01T02:00Z → 2026-11-30", () => {
    const clock = fixedClock(Temporal.Instant.from('2026-12-01T02:00:00Z'));
    expect(today(clock, 'America/New_York').toString()).toBe('2026-11-30');
  });

  it('uses the given time zone, not UTC', () => {
    const clock = fixedClock(Temporal.Instant.from('2026-12-01T02:00:00Z'));
    expect(today(clock, 'UTC').toString()).toBe('2026-12-01');
    expect(today(clock, 'Asia/Tokyo').toString()).toBe('2026-12-01');
  });

  it('is Wed Nov 18, 2026 for the pinned test instant', () => {
    const clock = fixedClock(Temporal.Instant.from('2026-11-18T17:00:00Z'));
    expect(today(clock, 'America/New_York').toString()).toBe('2026-11-18');
  });
});

describe('fixedClock', () => {
  it('always returns the same instant', () => {
    const instant = Temporal.Instant.from('2026-11-18T17:00:00Z');
    const clock = fixedClock(instant);
    expect(clock.now().equals(instant)).toBe(true);
    expect(clock.now().equals(instant)).toBe(true);
  });
});
