import { identity, type Database, type HouseholdContext, type Identity } from '@withinmeans/db';
import type { Clock } from '@withinmeans/domain';
import type { TokenVerifier } from './auth.js';
import type { IdentityProvider } from './identityProvider.js';
import type { Logger } from './logger.js';

export interface Context {
  db: Database;
  logger: Logger;
  identityProvider: IdentityProvider;
  clock: Clock;
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
  identityProvider: IdentityProvider;
  clock: Clock;
}

function bearerToken(authorization: string | undefined): string | undefined {
  const match = /^Bearer (\S+)$/i.exec(authorization ?? '');
  return match?.[1];
}

export function createContextFactory(
  deps: ContextDeps,
): (authorization: string | undefined) => Promise<Context> {
  const { db, verifier, logger, identityProvider, clock } = deps;
  const base = { db, logger, identityProvider, clock };
  return async (authorization) => {
    const token = bearerToken(authorization);
    if (token === undefined) return base;
    let auth: { sub: string };
    try {
      auth = await verifier.verify(token);
    } catch {
      logger.info('token rejected');
      return base;
    }
    const found = await identity.findByCognitoSub(db, auth.sub);
    if (found === undefined) return { ...base, auth };
    const { membership } = found;
    return {
      ...base,
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
