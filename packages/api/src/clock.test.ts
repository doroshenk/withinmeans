import { describe, expect, it } from 'vitest';
import { systemClock } from './clock.js';

describe('systemClock', () => {
  it('P1-02: reads the real time', () => {
    const before = Date.now();
    const now = systemClock.now().epochMilliseconds;
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });
});
