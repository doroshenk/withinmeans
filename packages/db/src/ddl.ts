import { sql } from 'kysely';
import type { Database } from './db.js';
import { withRetry } from './retry.js';

/**
 * Runs one DDL statement, retrying when DSQL reports a catalog conflict (OC001: "schema has been
 * updated by another transaction"). A conflicted statement did not commit, so retrying is safe.
 * `statement` is raw SQL: pass only trusted text (migration files, generated identifiers), never input.
 */
export async function runDdl(db: Database, statement: string): Promise<void> {
  await withRetry(() => sql.raw(statement).execute(db), { maxTries: 12, delayMs: 25 });
}
