import type { Role } from '../context.js';
import type { Database } from '../db.js';

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
  async findByCognitoSub(db: Database, sub: string): Promise<Identity | undefined> {
    const row = await db
      .selectFrom('users')
      .leftJoin('memberships', 'memberships.user_id', 'users.id')
      .leftJoin('households', 'households.id', 'memberships.household_id')
      .select([
        'users.id as userId',
        'users.email',
        'users.name',
        'households.id as householdId',
        'households.name as householdName',
        'memberships.role',
      ])
      .where('users.cognito_sub', '=', sub)
      .executeTakeFirst();
    if (row === undefined) return undefined;
    const user = { id: row.userId, email: row.email, name: row.name };
    if (row.householdId === null || row.householdName === null || row.role === null) {
      return { user };
    }
    return {
      user,
      membership: {
        householdId: row.householdId,
        householdName: row.householdName,
        role: row.role,
      },
    };
  },
};
