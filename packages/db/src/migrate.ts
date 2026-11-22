import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from 'kysely';
import type { Database } from './db.js';
import { lintMigration } from './lint/migrationLinter.js';

export const MIGRATIONS_DIR = new URL('../migrations/', import.meta.url);

/** Forward-only: applies new *.sql files in name order, each in its own transaction. */
export async function migrate(db: Database, dir: URL = MIGRATIONS_DIR): Promise<string[]> {
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`.execute(
    db,
  );
  const applied = new Map(
    (
      await sql<{
        name: string;
        checksum: string;
      }>`SELECT name, checksum FROM schema_migrations`.execute(db)
    ).rows.map((r) => [r.name, r.checksum]),
  );
  const ran: string[] = [];
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const text = readFileSync(join(dir.pathname.replace(/^\/([A-Za-z]:)/, '$1'), file), 'utf8');
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
    await db.transaction().execute(async (trx) => {
      await sql.raw(text).execute(trx);
      await sql`INSERT INTO schema_migrations (name, checksum) VALUES (${file}, ${checksum})`.execute(
        trx,
      );
    });
    ran.push(file);
  }
  return ran;
}
