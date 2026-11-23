import { fixedClock } from '@withinmeans/domain';
import { Temporal } from 'temporal-polyfill';
import type { TokenVerifier } from './auth.js';
import type { IdentityProvider } from './identityProvider.js';
import { createLogger, type Logger } from './logger.js';

/** Test helper: accepts tokens of the form `good:<sub>` and rejects everything else. */
export const fakeVerifier: TokenVerifier = {
  async verify(token) {
    if (token.startsWith('good:')) return { sub: token.slice('good:'.length) };
    throw new Error('invalid token');
  },
};

export function captureLogger(): { logger: Logger; lines: string[] } {
  const lines: string[] = [];
  return { logger: createLogger((l) => lines.push(l)), lines };
}

/** Wednesday Nov 18, 2026, noon UTC. */
export const testClock = fixedClock(Temporal.Instant.from('2026-11-18T12:00:00Z'));

export interface FakeIdentityProvider extends IdentityProvider {
  logins: Map<string, { sub: string; password: string }>;
  deleted: string[];
}

/** In-memory login provider: the sub is `sub:<email>`, so `good:sub:<email>` is a valid token. */
export function fakeIdentityProvider(): FakeIdentityProvider {
  const logins = new Map<string, { sub: string; password: string }>();
  const deleted: string[] = [];
  return {
    logins,
    deleted,
    async createLogin(email, password) {
      if (logins.has(email)) return 'exists';
      const sub = `sub:${email}`;
      logins.set(email, { sub, password });
      return { sub };
    },
    async deleteLogin(email) {
      deleted.push(email);
      logins.delete(email);
    },
  };
}
