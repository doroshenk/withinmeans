import { createDsqlDb } from '../dsql.js';
import { seedDev } from '../seed/seedDev.js';
import { lookupClusterEndpoint } from './lookupClusterEndpoint.js';
import { runSeedCli } from './seedCli.js';

await runSeedCli(process.argv.slice(2), {
  lookupEndpoint: lookupClusterEndpoint,
  connect: (endpoint) => createDsqlDb(endpoint),
  seed: seedDev,
  log: (line) => console.log(line),
  now: () => new Date(),
});
