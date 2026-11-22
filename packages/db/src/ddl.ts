import { sql } from 'kysely';
import type { Database } from './db.js';
import { withRetry } from './retry.js';

/**
 * Runs one DDL statement, retrying when DSQL reports a catalog conflict (OC001: "schema has been
 * updated by another transaction"). A conflicted statement did not commit, so retrying is safe.
 */
export async function runDdl(db: Database, statement: string): Promise<void> {
  await withRetry(() => sql.raw(statement).execute(db), { maxTries: 8, delayMs: 25 });
}
