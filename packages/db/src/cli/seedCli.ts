import type { Database } from '../db.js';
import type { SeedOptions, SeedResult } from '../seed/seedDev.js';

export interface SeedCliDeps {
  /** Reads the ClusterEndpoint output of a CloudFormation stack. */
  lookupEndpoint(stack: string): Promise<string>;
  connect(endpoint: string): Database;
  seed(db: Database, options: SeedOptions): Promise<SeedResult>;
  log(line: string): void;
  now(): Date;
}

/** `pnpm seed:dev`. Loads the spec §10 data into dev, and nowhere else. */
export async function runSeedCli(_argv: string[], _deps: SeedCliDeps): Promise<void> {
  throw new Error('not implemented');
}
