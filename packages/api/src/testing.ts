import type { TokenVerifier } from './auth.js';
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
