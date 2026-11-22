import { beforeEach, describe, expect, it, vi } from 'vitest';

type Pool = { config: Record<string, unknown>; handlers: Record<string, (c: unknown) => void> };
const pools: Pool[] = [];
vi.mock('@aws/aurora-dsql-node-postgres-connector', () => ({
  AuroraDSQLPool: class {
    handlers: Record<string, (c: unknown) => void> = {};
    constructor(public config: Record<string, unknown>) {
      pools.push(this);
    }
    on(event: string, fn: (c: unknown) => void) {
      this.handlers[event] = fn;
      return this;
    }
  },
}));

import { createDsqlDb, dsqlPoolConfig } from './dsql.js';

const ENDPOINT = 'abcdefghijklmnopqrstuvwxyz.dsql.us-east-2.on.aws';

beforeEach(() => {
  pools.length = 0;
});

describe('P0-07: DSQL connection', () => {
  it('P0-07: connects as admin with IAM auth (no password) to the cluster endpoint', () => {
    const config = dsqlPoolConfig(ENDPOINT);
    expect(config).toMatchObject({ host: ENDPOINT, user: 'admin', database: 'postgres' });
    expect(config).not.toHaveProperty('password');
  });

  it('P0-07: createDsqlDb builds a pool from that config', () => {
    createDsqlDb(ENDPOINT);
    expect(pools).toHaveLength(1);
    expect(pools[0]?.config).toMatchObject({ host: ENDPOINT });
  });

  it('P0-07: a schema is applied to every new connection through search_path', () => {
    createDsqlDb(ENDPOINT, 't_abc');
    const query = vi.fn().mockResolvedValue({});
    pools[0]?.handlers['connect']?.({ query });
    expect(query).toHaveBeenCalledWith('SET search_path TO "t_abc"');
  });

  it('P0-07: without a schema no search_path is set', () => {
    createDsqlDb(ENDPOINT);
    expect(pools[0]?.handlers['connect']).toBeUndefined();
  });

  it('P0-07: rejects a schema name that is not a plain identifier', () => {
    expect(() => createDsqlDb(ENDPOINT, 'x"; drop table households; --')).toThrow(/schema/);
  });
});
