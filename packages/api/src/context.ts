import { identity, type Database, type HouseholdContext, type Identity } from '@withinmeans/db';
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

function bearerToken(authorization: string | undefined): string | undefined {
  const match = /^Bearer (\S+)$/i.exec(authorization ?? '');
  return match?.[1];
}

export function createContextFactory(
  deps: ContextDeps,
): (authorization: string | undefined) => Promise<Context> {
  const { db, verifier, logger } = deps;
  return async (authorization) => {
    const token = bearerToken(authorization);
    if (token === undefined) return { logger };
    let auth: { sub: string };
    try {
      auth = await verifier.verify(token);
    } catch {
      logger.info('token rejected');
      return { logger };
    }
    const found = await identity.findByCognitoSub(db, auth.sub);
    if (found === undefined) return { logger, auth };
    const { membership } = found;
    return {
      logger,
      auth,
      identity: found,
      ...(membership === undefined
        ? {}
        : {
            household: {
              householdId: membership.householdId,
              userId: found.user.id,
              role: membership.role,
            },
          }),
    };
  };
}
