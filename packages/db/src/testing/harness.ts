import { randomUUID } from 'node:crypto';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { sql } from 'kysely';
import { createDb, type Database } from '../db.js';
import { runDdl } from '../ddl.js';
import { createDsqlDb } from '../dsql.js';
import { migrate } from '../migrate.js';
import { testTarget } from './target.js';

export interface TestDb {
  db: Database;
  schema: string;
  destroy(): Promise<void>;
}

let container: Promise<StartedPostgreSqlContainer> | undefined;

/** One Postgres 16 container per test worker (reaped on exit). */
async function containerUri(): Promise<string> {
  container ??= new PostgreSqlContainer('postgres:16-alpine').start();
  return (await container).getConnectionUri();
}

/** Opens a connection scoped to `schema` (or unscoped when omitted) on the configured target. */
async function opener(): Promise<(schema?: string) => Database> {
  const target = testTarget(process.env);
  if (target.kind === 'dsql') return (schema) => createDsqlDb(target.endpoint, schema);
  const url = target.kind === 'url' ? target.url : await containerUri();
  return (schema) =>
    createDb(
      schema === undefined
        ? { connectionString: url, max: 1 }
        : { connectionString: url, options: `-c search_path=${schema}` },
    );
}

const quoteIdent = (name: string): string => `"${name.replaceAll('"', '""')}"`;

/** `runDdl` for the harness's own schema changes, which collide with other test files'. */
export async function runTestDdl(db: Database, statement: string): Promise<void> {
  void db;
  void statement;
  throw new Error('not implemented');
}

/**
 * Gives the caller a fresh schema with all migrations applied, and drops it afterwards. Runs on
 * Docker Postgres by default, or on the real DSQL cluster when DSQL_ENDPOINT is set (the
 * conformance run).
 */
export async function createTestDb(): Promise<TestDb> {
  const open = await opener();
  const schema = `t_${randomUUID().replaceAll('-', '')}`;
  const admin = open();
  await runDdl(admin, `CREATE SCHEMA ${quoteIdent(schema)}`);
  await admin.destroy();

  const db = open(schema);
  await migrate(db);
  return {
    db,
    schema,
    async destroy() {
      // DSQL allows one DDL statement per transaction, so drop tables one at a time, then the schema.
      const tables = await sql<{
        table_name: string;
      }>`SELECT table_name FROM information_schema.tables
        WHERE table_schema = ${schema}`.execute(db);
      for (const { table_name } of tables.rows) {
        await runDdl(db, `DROP TABLE ${quoteIdent(schema)}.${quoteIdent(table_name)}`);
      }
      await runDdl(db, `DROP SCHEMA ${quoteIdent(schema)}`);
      await db.destroy();
    },
  };
}
