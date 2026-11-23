import { identity, type Database, type HouseholdContext, type Identity } from '@withinmeans/db';
import type { Clock } from '@withinmeans/domain';
import type { TokenVerifier } from './auth.js';
import type { InviteEmailSender } from './emailSender.js';
import type { IdentityProvider } from './identityProvider.js';
import type { Logger } from './logger.js';

/** What partner invites need beyond the database. */
export interface InviteDeps {
  emailSender: InviteEmailSender;
  /** A fresh unguessable token; the secret in the accept link. */
  newToken: () => string;
  /** The site's origin, e.g. `https://within.doroshenk.com`; the accept link is built on it. */
  appUrl: string;
}

export interface Context {
  db: Database;
  logger: Logger;
  identityProvider: IdentityProvider;
  clock: Clock;
  invites: InviteDeps;
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
  invites: InviteDeps;
}

function bearerToken(authorization: string | undefined): string | undefined {
  const match = /^Bearer (\S+)$/i.exec(authorization ?? '');
  return match?.[1];
}

export function createContextFactory(
  deps: ContextDeps,
): (authorization: string | undefined) => Promise<Context> {
  const { db, verifier, logger, identityProvider, clock, invites } = deps;
  const base = { db, logger, identityProvider, clock, invites };
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
