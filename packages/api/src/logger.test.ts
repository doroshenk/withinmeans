import { describe, expect, it } from 'vitest';
import { createLogger, scrub } from './logger.js';

describe('P0-09: scrub', () => {
  it('drops any field ending in _cents or Cents, at any depth', () => {
    expect(
      scrub({
        name: 'Rent',
        amount_cents: 123456,
        estimateCents: 5,
        nested: { actual_cents: 9, keep: 'yes' },
        list: [{ moved_cents: 1, id: 'a' }],
      }),
    ).toEqual({ name: 'Rent', nested: { keep: 'yes' }, list: [{ id: 'a' }] });
  });
  it('drops request and response bodies', () => {
    expect(
      scrub({ body: '{"a":1}', requestBody: {}, responseBody: {}, input: {}, status: 200 }),
    ).toEqual({ status: 200 });
  });
  it('leaves scalars and null alone', () => {
    expect(scrub('x')).toBe('x');
    expect(scrub(null)).toBeNull();
    expect(scrub(7)).toBe(7);
  });
  it('does not drop fields that merely contain "cents" or "body" in the middle', () => {
    expect(scrub({ centsOfSomething: 1, bodyguard: 'ok' })).toEqual({
      centsOfSomething: 1,
      bodyguard: 'ok',
    });
  });
});

describe('P0-09: logger drops any field ending in _cents and any request/response body', () => {
  it('writes one JSON line with the level and message and no money or body', () => {
    const lines: string[] = [];
    const log = createLogger((l) => lines.push(l));
    log.info('request', { path: '/me', total_cents: 99900, body: 'secret', status: 200 });
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] as string)).toEqual({
      level: 'info',
      message: 'request',
      path: '/me',
      status: 200,
    });
    expect(lines[0]).not.toContain('99900');
    expect(lines[0]).not.toContain('secret');
  });
  it('error level works the same way', () => {
    const lines: string[] = [];
    createLogger((l) => lines.push(l)).error('boom', { price_cents: 5 });
    expect(JSON.parse(lines[0] as string)).toEqual({ level: 'error', message: 'boom' });
  });
});
