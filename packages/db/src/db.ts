import { Kysely, PostgresDialect, type Generated } from 'kysely';
import pg from 'pg';

// bigint (money in cents) as number: safe far beyond any household's cents.
pg.types.setTypeParser(pg.types.builtins.INT8, Number);
// DATE stays a 'YYYY-MM-DD' string so no time zone can shift a business date.
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

export interface HouseholdsTable {
  id: Generated<string>;
  name: string;
  mode: 'solo' | 'duo';
  timezone: string;
  cushion_cents: Generated<number>;
  first_month: string;
  created_at: Generated<Date>;
}

export interface UsersTable {
  id: Generated<string>;
  email: string;
  name: string;
  cognito_sub: string;
  created_at: Generated<Date>;
}

export interface MembershipsTable {
  household_id: string;
  user_id: string;
  role: 'owner' | 'full' | 'view';
}

export interface DB {
  households: HouseholdsTable;
  users: UsersTable;
  memberships: MembershipsTable;
}

export type Database = Kysely<DB>;

/** The only place a connection pool is created. `options` can set e.g. search_path. */
export function createDb(config: pg.PoolConfig): Database {
  return new Kysely<DB>({ dialect: new PostgresDialect({ pool: new pg.Pool(config) }) });
}
