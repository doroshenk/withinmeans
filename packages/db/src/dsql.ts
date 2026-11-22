import { AuroraDSQLPool } from '@aws/aurora-dsql-node-postgres-connector';
import { Kysely, PostgresDialect } from 'kysely';
import type { DB, Database } from './db.js';

export const DSQL_USER = 'admin';

/** IAM auth: the connector signs a short-lived token from your AWS credentials; no password. */
export function dsqlPoolConfig(endpoint: string) {
  return { host: endpoint, user: DSQL_USER, database: 'postgres', max: 5 };
}

/** The only place a DSQL pool is created. `schema` scopes the connection (throwaway test schemas). */
export function createDsqlDb(endpoint: string, schema?: string): Database {
  if (schema !== undefined && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) {
    throw new Error(`Invalid schema name "${schema}"`);
  }
  const pool = new AuroraDSQLPool(dsqlPoolConfig(endpoint));
  if (schema !== undefined) {
    pool.on('connect', (client) => {
      void client.query(`SET search_path TO "${schema}"`);
    });
  }
  return new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });
}
