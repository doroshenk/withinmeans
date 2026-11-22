import type { Database } from '../db.js';

export interface TestDb {
  db: Database;
  schema: string;
  destroy(): Promise<void>;
}

/** Starts (or reuses) a Postgres 16 container and gives the caller a fresh, migrated schema. */
export async function createTestDb(): Promise<TestDb> {
  throw new Error('not implemented');
}
