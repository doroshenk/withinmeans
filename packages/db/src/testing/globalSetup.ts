import { createDsqlDb } from '../dsql.js';
import { sweepTestSchemas } from './sweep.js';

/** Before the conformance run only: clear schemas a crashed earlier run left on the dev cluster. */
export default async function setup(): Promise<void> {
  const endpoint = process.env['DSQL_ENDPOINT'];
  if (!endpoint) return;
  const db = createDsqlDb(endpoint);
  try {
    const dropped = await sweepTestSchemas(db);
    if (dropped.length > 0) console.log(`Swept ${dropped.length} leftover test schema(s)`);
  } finally {
    await db.destroy();
  }
}
