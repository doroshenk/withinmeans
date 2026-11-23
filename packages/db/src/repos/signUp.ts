import type { Database } from '../db.js';
import { inTransaction, orConflict } from './shared.js';

export interface NewHousehold {
  /** 'partner' households are stored as 'duo'; the partner joins by invite later. */
  mode: 'solo' | 'partner';
  householdName: string;
  userName: string;
  email: string;
  cognitoSub: string;
  timezone: string;
  /** "YYYY-MM"; the caller works it out from today's date in the household time zone. */
  firstMonth: string;
}

/**
 * Sign-up runs before there is a household, so like `identity` it cannot take a
 * HouseholdContext. It only ever inserts brand-new rows.
 */
export const signUp = {
  /** Household, user and owner Membership in one transaction. A taken email or login is a Conflict. */
  async createHousehold(
    db: Database,
    input: NewHousehold,
  ): Promise<{ householdId: string; userId: string }> {
    return orConflict(
      () =>
        inTransaction(db, async (trx) => {
          const household = await trx
            .insertInto('households')
            .values({
              name: input.householdName,
              mode: input.mode === 'solo' ? 'solo' : 'duo',
              timezone: input.timezone,
              first_month: input.firstMonth,
            })
            .returning('id')
            .executeTakeFirstOrThrow();
          const user = await trx
            .insertInto('users')
            .values({
              email: input.email.trim().toLowerCase(),
              name: input.userName,
              cognito_sub: input.cognitoSub,
            })
            .returning('id')
            .executeTakeFirstOrThrow();
          await trx
            .insertInto('memberships')
            .values({ household_id: household.id, user_id: user.id, role: 'owner' })
            .execute();
          return { householdId: household.id, userId: user.id };
        }),
      'That email or login is already registered',
    );
  },
};
