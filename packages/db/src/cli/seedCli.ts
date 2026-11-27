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

const USAGE = 'Usage: pnpm seed:dev [--reset] [--owner-email <dev login> [--leave-household]]';

/** The options after the stage; anything not recognised is an error, so a typo changes nothing. */
function parse(argv: readonly string[]): Omit<SeedOptions, 'now'> {
  const options: Omit<SeedOptions, 'now'> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    // pnpm passes a "--" separator through.
    if (arg === '--') continue;
    if (arg === '--stage') i += 1;
    else if (arg === '--reset') options.reset = true;
    else if (arg === '--leave-household') options.leaveHousehold = true;
    else if (arg === '--owner-email') {
      const email = argv[(i += 1)];
      if (email === undefined || email.startsWith('--')) throw new Error(USAGE);
      options.ownerEmail = email;
    } else throw new Error(USAGE);
  }
  return options;
}

/** `pnpm seed:dev`. Loads the spec §10 data into dev, and nowhere else. */
export async function runSeedCli(argv: string[], deps: SeedCliDeps): Promise<void> {
  const stages = argv.flatMap((arg, i) => (arg === '--stage' ? [argv[i + 1]] : []));
  // Every --stage must say dev: `pnpm seed:dev --stage prod` arrives with two.
  if (stages.length === 0 || stages.some((stage) => stage !== 'dev')) {
    throw new Error('Refusing to seed: the seed runs on the dev stage only');
  }
  const options = parse(argv);

  const db = deps.connect(await deps.lookupEndpoint('DataStack-dev'));
  try {
    await deps.seed(db, { now: deps.now(), ...options });
    deps.log('dev: seeded "Our household" with November 2026');
    if (options.ownerEmail === undefined) {
      deps.log(
        'Its made-up members cannot sign in. To look at it, run again with ' +
          '--reset --owner-email <your dev login> --leave-household',
      );
    }
  } finally {
    await db.destroy();
  }
}
