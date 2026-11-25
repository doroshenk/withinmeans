import { afterEach, describe, expect, it, vi } from 'vitest';
import { env } from './env.js';

afterEach(() => vi.unstubAllEnvs());

describe('P1-14: env', () => {
  it('returns a set variable', () => {
    vi.stubEnv('EXAMPLE_SETTING', 'value');
    expect(env('EXAMPLE_SETTING')).toBe('value');
  });

  it.each([undefined, ''])('throws, naming the variable, when it is %j', (value) => {
    vi.stubEnv('EXAMPLE_SETTING', value);
    expect(() => env('EXAMPLE_SETTING')).toThrow('Missing environment variable EXAMPLE_SETTING');
  });
});
