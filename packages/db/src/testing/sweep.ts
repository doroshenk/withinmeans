import { sql } from 'kysely';
import type { Database } from '../db.js';
import { runDdl } from '../ddl.js';

/** Test schemas created by createTestDb: t_ plus a UUID without dashes. */
const TEST_SCHEMA = /^t_[0-9a-f]{32}$/;
const quote = (name: string): string => `"${name.replaceAll('"', '""')}"`;

/**
 * Drops leftover test schemas (a crashed run leaves them behind, and Aurora DSQL allows only 10
 * schemas per database). Tables go one at a time (one DDL statement per transaction). Schemas in
 * `keep` are never touched. Returns the schemas dropped. Single-runner only: it would also drop the
 * live schemas of a concurrent run on the same database (CI serialises runs with a concurrency group).
 */
export async function sweepTestSchemas(db: Database, keep: string[] = []): Promise<string[]> {
  const { rows } = await sql<{
    schema_name: string;
  }>`SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 't%'`.execute(db);
  const dropped: string[] = [];
  for (const { schema_name } of rows) {
    if (!TEST_SCHEMA.test(schema_name) || keep.includes(schema_name)) continue;
    const tables = await sql<{
      table_name: string;
    }>`SELECT table_name FROM information_schema.tables WHERE table_schema = ${schema_name}`.execute(
      db,
    );
    for (const { table_name } of tables.rows) {
      await runDdl(db, `DROP TABLE ${quote(schema_name)}.${quote(table_name)}`);
    }
    await runDdl(db, `DROP SCHEMA ${quote(schema_name)}`);
    dropped.push(schema_name);
  }
  return dropped;
}
