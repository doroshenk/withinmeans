import { createDsqlDb } from '../dsql.js';
import { migrate } from '../migrate.js';
import { lookupClusterEndpoint } from './lookupClusterEndpoint.js';
import { runMigrateCli } from './migrateCli.js';

await runMigrateCli(process.argv.slice(2), {
  lookupEndpoint: lookupClusterEndpoint,
  connect: (endpoint) => createDsqlDb(endpoint),
  migrate,
  log: (line) => console.log(line),
  env: process.env,
});
