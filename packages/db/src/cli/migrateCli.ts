import type { Database } from '../db.js';

export interface MigrateCliDeps {
  lookupEndpoint(stack: string): Promise<string>;
  connect(endpoint: string): Database;
  migrate(db: Database): Promise<string[]>;
  log(line: string): void;
}
export async function runMigrateCli(_argv: string[], _deps: MigrateCliDeps): Promise<void> {
  throw new Error('not implemented');
}
