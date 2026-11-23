import type { Database } from '@withinmeans/db';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { describe, expect, it } from 'vitest';
import { createHandler } from './handler.js';
import { captureLogger, fakeIdentityProvider, fakeVerifier, testClock } from './testing.js';

function event(path: string, token?: string, method = 'GET'): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: path,
    rawQueryString: '',
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
    requestContext: { http: { method, path } },
    isBase64Encoded: false,
  } as unknown as APIGatewayProxyEventV2;
}

/** A database whose every query fails with a message and a detail that must never escape. */
const brokenDb = {
  selectFrom() {
    throw Object.assign(new Error('connection reset'), {
      detail: 'row has amount_cents=123456',
      amount_cents: 123456,
    });
  },
} as unknown as Database;

function setup() {
  const { logger, lines } = captureLogger();
  return {
    handler: createHandler({
      db: brokenDb,
      verifier: fakeVerifier,
      logger,
      identityProvider: fakeIdentityProvider(),
      clock: testClock,
    }),
    lines,
  };
}

describe('P0-09: handler', () => {
  it('P0-09: a request with no token gets 401', async () => {
    const res = (await setup().handler(event('/me'))) as APIGatewayProxyStructuredResultV2;
    expect(res.statusCode).toBe(401);
  });

  it('P0-09: serves the same procedure under the /api prefix CloudFront forwards', async () => {
    const res = (await setup().handler(event('/api/me'))) as APIGatewayProxyStructuredResultV2;
    expect(res.statusCode).toBe(401);
  });

  it('P0-09: unhandled errors return a generic message; details go to the log without amounts', async () => {
    const { handler, lines } = setup();
    const res = (await handler(event('/me', 'good:sub-x'))) as APIGatewayProxyStructuredResultV2;
    expect(res.statusCode).toBe(500);
    const body = String(res.body);
    expect(body).toContain('Something went wrong');
    expect(body).not.toContain('connection reset');
    expect(body).not.toContain('123456');
    expect(body).not.toContain('stack');
    const logged = lines.join('\n');
    expect(logged).toContain('connection reset');
    expect(logged).not.toContain('123456');
    expect(logged).not.toContain('amount_cents');
  });

  it('P0-09: redacts digits in error messages before logging', async () => {
    const db = {
      selectFrom() {
        throw new Error('invalid input syntax for type bigint: "987654"');
      },
    } as unknown as Database;
    const { logger, lines } = captureLogger();
    const handler = createHandler({
      db,
      verifier: fakeVerifier,
      logger,
      identityProvider: fakeIdentityProvider(),
      clock: testClock,
    });
    await handler(event('/me', 'good:sub-x'));
    const logged = lines.join('\n');
    expect(logged).toContain('invalid input syntax');
    expect(logged).not.toContain('987654');
  });

  it('P0-09: logs each request without its body', async () => {
    const { handler, lines } = setup();
    await handler({ ...event('/me', undefined, 'POST'), body: '{"total_cents":777}' });
    expect(lines.join('\n')).not.toContain('777');
  });

  it('P0-09: expected rejections (no token) are logged at info, not as errors', async () => {
    const { handler, lines } = setup();
    await handler(event('/me'));
    const levels = lines.map((l) => (JSON.parse(l) as { level: string }).level);
    expect(levels).not.toContain('error');
  });

  it('P0-09: a bare /api path is not treated as an error in the handler', async () => {
    const res = (await setup().handler(event('/api'))) as APIGatewayProxyStructuredResultV2;
    expect(res.statusCode).toBe(404);
  });
});
