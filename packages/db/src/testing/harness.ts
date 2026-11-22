import { randomUUID } from 'node:crypto';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { sql } from 'kysely';
import { createDb, type Database } from '../db.js';
import { migrate } from '../migrate.js';

export interface TestDb {
  db: Database;
  schema: string;
  destroy(): Promise<void>;
}

let container: Promise<StartedPostgreSqlContainer> | undefined;

/** One Postgres 16 container per test worker (reaped on exit), or TEST_DATABASE_URL if set (CI). */
async function connectionUri(): Promise<string> {
  if (process.env['TEST_DATABASE_URL']) return process.env['TEST_DATABASE_URL'];
  container ??= new PostgreSqlContainer('postgres:16-alpine').start();
  return (await container).getConnectionUri();
}

/** Gives the caller a fresh schema with all migrations applied. */
export async function createTestDb(): Promise<TestDb> {
  const url = await connectionUri();
  const schema = `t_${randomUUID().replaceAll('-', '')}`;
  const admin = createDb({ connectionString: url, max: 1 });
  await sql`CREATE SCHEMA ${sql.id(schema)}`.execute(admin);
  await admin.destroy();

  const db = createDb({ connectionString: url, options: `-c search_path=${schema}` });
  await migrate(db);
  return {
    db,
    schema,
    async destroy() {
      await sql`DROP SCHEMA ${sql.id(schema)} CASCADE`.execute(db);
      await db.destroy();
    },
  };
}
