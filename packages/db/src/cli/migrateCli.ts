import type { Database } from '../db.js';

export interface MigrateCliDeps {
  /** Reads the ClusterEndpoint output of a CloudFormation stack. */
  lookupEndpoint(stack: string): Promise<string>;
  connect(endpoint: string): Database;
  migrate(db: Database): Promise<string[]>;
  log(line: string): void;
}

/** `pnpm migrate --stage dev`. Prod migrates only from the tag workflow, never a laptop. */
export async function runMigrateCli(argv: string[], deps: MigrateCliDeps): Promise<void> {
  const at = argv.indexOf('--stage');
  const stage = at === -1 ? undefined : argv[at + 1];
  if (stage === undefined) throw new Error('Usage: pnpm migrate --stage dev');
  if (stage === 'prod') {
    throw new Error('Refusing to migrate prod from a laptop: prod migrates from the tag workflow');
  }
  if (stage !== 'dev') throw new Error(`Unknown stage "${stage}": use --stage dev`);

  const db = deps.connect(await deps.lookupEndpoint(`DataStack-${stage}`));
  try {
    const applied = await deps.migrate(db);
    deps.log(
      applied.length === 0 ? `${stage}: up to date` : `${stage}: applied ${applied.join(', ')}`,
    );
  } finally {
    await db.destroy();
  }
}
