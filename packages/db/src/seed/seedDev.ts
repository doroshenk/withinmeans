import type { Database } from '../db.js';

/** The seeded household always has this id, so that a re-run finds it. */
export const SEED_HOUSEHOLD_ID = '5eed0000-0000-4000-8000-000000000001';

export interface SeedOptions {
  /** When the seeded month was started. */
  now: Date;
  /** Rebuilds the seeded household if it is there already. */
  reset?: boolean;
  /** An existing dev login to be the owner, so that someone can sign in and look. */
  ownerEmail?: string;
  /** Allows that login to be moved out of the household it is in. */
  leaveHousehold?: boolean;
}

export interface SeedResult {
  householdId: string;
  ownerEmail: string;
}

export async function seedDev(_db: Database, _options: SeedOptions): Promise<SeedResult> {
  throw new Error('not implemented');
}
