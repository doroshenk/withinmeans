import type { Kysely } from 'kysely';

export interface HouseholdsTable {
  id: string;
  name: string;
  mode: 'solo' | 'duo';
  timezone: string;
  cushion_cents: number;
  first_month: string;
  created_at: Date;
}

export interface DB {
  households: HouseholdsTable;
}

export type Database = Kysely<DB>;
