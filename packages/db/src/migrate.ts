import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'kysely';
import type { Database } from './db.js';
import { lintMigration } from './lint/migrationLinter.js';
import { runDdl } from './ddl.js';
import { splitStatements } from './sqlStatements.js';
import { withRetry } from './retry.js';

/** The linter guarantees a migration is DDL-only or DML-only; this is the DDL side. */
const DDL = /^(--[^\n]*\n|\/\*[\s\S]*?\*\/|\s)*(CREATE|ALTER|DROP|COMMENT)\b/i;

export const MIGRATIONS_DIR = new URL('../migrations/', import.meta.url);

/**
 * Forward-only: applies new *.sql files in name order, each in its own transaction. `ddl` runs each
 * schema change; the test harness passes a more patient one.
 */
export async function migrate(
  db: Database,
  dir: URL = MIGRATIONS_DIR,
  ddl: typeof runDdl = runDdl,
): Promise<string[]> {
  await ddl(
    db,
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`,
  );
  // A read can conflict too (OC001), straight after a schema change.
  const recorded = await withRetry(
    () =>
      sql<{
        name: string;
        checksum: string;
      }>`SELECT name, checksum FROM schema_migrations`.execute(db),
    { maxTries: 12, delayMs: 25 },
  );
  const applied = new Map(recorded.rows.map((r) => [r.name, r.checksum]));
  const ran: string[] = [];
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const text = readFileSync(join(fileURLToPath(dir), file), 'utf8');
    const checksum = createHash('sha256').update(text).digest('hex');
    const previous = applied.get(file);
    if (previous !== undefined) {
      if (previous !== checksum)
        throw new Error(`Migration ${file} was edited after it was applied`);
      continue;
    }
    const violations = lintMigration(text);
    if (violations.length > 0) {
      throw new Error(
        `Migration ${file} fails the DSQL linter: ${violations.map((v) => v.rule).join(', ')}`,
      );
    }
    const record = (trx: Database) =>
      sql`INSERT INTO schema_migrations (name, checksum) VALUES (${file}, ${checksum})`.execute(
        trx,
      );
    const statements = splitStatements(text);
    if (statements.some((s) => DDL.test(s))) {
      // Aurora DSQL allows one DDL statement per transaction and no DDL mixed with DML, so each
      // statement runs on its own and the bookkeeping row is written afterwards. A failure part-way
      // leaves earlier statements applied and the migration unrecorded: write DDL to be re-runnable
      // (IF NOT EXISTS).
      for (const statement of statements) await ddl(db, statement);
      // A conflicted insert did not commit. Without its row the migration would run again.
      await withRetry(() => record(db), { maxTries: 12, delayMs: 25 });
    } else {
      // The transaction is all or nothing, so a conflicted try can run again. DSQL reports one
      // (OC001) when the schema has just changed, as after an earlier DDL migration.
      await withRetry(
        () =>
          db.transaction().execute(async (trx) => {
            for (const statement of statements) await sql.raw(statement).execute(trx);
            await record(trx);
          }),
        { maxTries: 12, delayMs: 25 },
      );
    }
    ran.push(file);
  }
  return ran;
}
