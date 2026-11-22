import { describe, expect, it, vi } from 'vitest';
import { withRetry } from './retry.js';

const occError = () => Object.assign(new Error('change conflicts'), { code: '40001' });

describe('withRetry', () => {
  it('retries on the serialization/OCC error code and then succeeds', async () => {
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(occError())
      .mockRejectedValueOnce(occError())
      .mockResolvedValue('ok');
    await expect(withRetry(fn, { maxTries: 5 })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('gives up after maxTries and rethrows the last error', async () => {
    const fn = vi.fn<() => Promise<string>>().mockRejectedValue(occError());
    await expect(withRetry(fn, { maxTries: 3 })).rejects.toMatchObject({ code: '40001' });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry other errors', async () => {
    const fn = vi.fn<() => Promise<string>>().mockRejectedValue(new Error('boom'));
    await expect(withRetry(fn, { maxTries: 3 })).rejects.toThrow('boom');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
