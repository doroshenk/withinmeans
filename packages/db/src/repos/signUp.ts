import type { Database } from '../db.js';

export interface NewHousehold {
  mode: 'solo' | 'partner';
  householdName: string;
  userName: string;
  email: string;
  cognitoSub: string;
  timezone: string;
  /** "YYYY-MM"; the caller works it out from today's date in the household's time zone. */
  firstMonth: string;
}

export const signUp = {
  async createHousehold(
    _db: Database,
    _input: NewHousehold,
  ): Promise<{ householdId: string; userId: string }> {
    throw new Error('not implemented');
  },
};
