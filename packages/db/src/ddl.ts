import type { Database } from './db.js';

/** Runs one DDL statement, retrying when DSQL reports a catalog conflict (OC001). */
export async function runDdl(_db: Database, _statement: string): Promise<void> {
  throw new Error('not implemented');
}
