import type { HouseholdContext, Role } from '../context.js';
import type { Database } from '../db.js';

export interface Member {
  userId: string;
  name: string;
  email: string;
  role: Role;
}

export const memberships = {
  async list(db: Database, ctx: HouseholdContext): Promise<Member[]> {
    return db
      .selectFrom('memberships')
      .innerJoin('users', 'users.id', 'memberships.user_id')
      .select(['users.id as userId', 'users.name', 'users.email', 'memberships.role'])
      .where('memberships.household_id', '=', ctx.householdId)
      .orderBy('users.name')
      .execute();
  },
};
