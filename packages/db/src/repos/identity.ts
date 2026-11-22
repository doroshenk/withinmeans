import type { Database } from '../db.js';
import type { Role } from '../context.js';

export interface Identity {
  user: { id: string; email: string; name: string };
  /** Absent until the user belongs to a household. */
  membership?: { householdId: string; householdName: string; role: Role };
}

/**
 * Who is this verified Cognito login? This is the one query that cannot take a HouseholdContext:
 * it is how the context gets built. It starts from the token's `sub`, never from request input.
 */
export const identity = {
  async findByCognitoSub(_db: Database, _sub: string): Promise<Identity | undefined> {
    throw new Error('not implemented');
  },
};
