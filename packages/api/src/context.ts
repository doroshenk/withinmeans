import type { Database, HouseholdContext, Identity } from '@withinmeans/db';
import type { TokenVerifier } from './auth.js';
import type { Logger } from './logger.js';

export interface Context {
  logger: Logger;
  /** Set only when the bearer token verified. */
  auth?: { sub: string };
  identity?: Identity;
  /** Built only from the verified token and the user's Membership, never from request input. */
  household?: HouseholdContext;
}

export interface ContextDeps {
  db: Database;
  verifier: TokenVerifier;
  logger: Logger;
}

export function createContextFactory(
  _deps: ContextDeps,
): (authorization: string | undefined) => Promise<Context> {
  throw new Error('not implemented');
}
