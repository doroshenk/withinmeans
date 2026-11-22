import type { Database } from './db.js';

export const DSQL_USER = 'admin';
export function dsqlPoolConfig(_endpoint: string): Record<string, unknown> {
  throw new Error('not implemented');
}
export function createDsqlDb(_endpoint: string, _schema?: string): Database {
  throw new Error('not implemented');
}
