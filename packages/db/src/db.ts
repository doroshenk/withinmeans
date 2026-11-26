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

export interface InvitesTable {
  id: Generated<string>;
  household_id: string;
  name: string;
  email: string;
  role: 'full' | 'view';
  note: Generated<string>;
  token: string;
  expires_at: Date;
  accepted_at: Date | null;
  invited_by: string;
  created_at: Generated<Date>;
}

export interface MonthsTable {
  household_id: string;
  ym: string;
  status: Generated<'open' | 'closed'>;
  started_at: Date;
  closed_at: Date | null;
}

export interface CategoriesTable {
  id: Generated<string>;
  household_id: string;
  name: string;
  name_key: string;
  color_index: Generated<number>;
  sort: Generated<number>;
  archived_at: Date | null;
}

export type AccountType = 'checking' | 'savings' | 'cash' | 'brokerage';

export interface AccountsTable {
  id: Generated<string>;
  household_id: string;
  name: string;
  type: AccountType;
  is_primary_checking: Generated<boolean>;
  created_at: Generated<Date>;
  archived_at: Date | null;
}

export interface BalanceSnapshotsTable {
  id: Generated<string>;
  household_id: string;
  account_id: string;
  /** 'YYYY-MM-DD' */
  date: string;
  balance_cents: number;
  note: Generated<string>;
  created_at: Generated<Date>;
}

export interface RecurringBillsTable {
  id: Generated<string>;
  household_id: string;
  name: string;
  estimate_cents: number;
  due_day: number;
  category_id: string;
  autopay: Generated<boolean>;
  account_id: string | null;
  start_ym: string;
  end_ym: string | null;
  created_at: Generated<Date>;
}

export interface BillsTable {
  id: Generated<string>;
  household_id: string;
  ym: string;
  /** Null for a one-time bill. */
  recurring_bill_id: string | null;
  name: string;
  category_id: string;
  /** 'YYYY-MM-DD' */
  due_date: string;
  estimate_cents: number | null;
  actual_cents: number | null;
  paid_at: Date | null;
  kind: 'recurring' | 'one_time';
  created_at: Generated<Date>;
}

export interface PaySchedulesTable {
  id: Generated<string>;
  household_id: string;
  name: string;
  frequency: 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';
  /** 'YYYY-MM-DD' */
  anchor_date: string;
  semimonthly_day_1: number | null;
  semimonthly_day_2: number | null;
  usual_cents: number;
  account_id: string | null;
  /** 'YYYY-MM-DD' */
  ended_on: string | null;
  created_at: Generated<Date>;
}

export interface PaychecksTable {
  id: Generated<string>;
  household_id: string;
  schedule_id: string;
  /** 'YYYY-MM-DD' */
  expected_date: string;
  expected_cents: number;
  /** 'YYYY-MM-DD'; null until received, like received_cents. */
  received_date: string | null;
  received_cents: number | null;
  created_at: Generated<Date>;
}

export interface OtherIncomeTable {
  id: Generated<string>;
  household_id: string;
  /** 'YYYY-MM-DD' */
  date: string;
  source: string;
  type: 'side_work' | 'sale' | 'refund' | 'gift' | 'bonus' | 'other';
  amount_cents: number;
  account_id: string | null;
  note: string | null;
  created_at: Generated<Date>;
}

export interface SetupProgressTable {
  household_id: string;
  step: number;
  status: 'done' | 'skipped';
  updated_at: Generated<Date>;
}

export interface DB {
  households: HouseholdsTable;
  users: UsersTable;
  memberships: MembershipsTable;
  invites: InvitesTable;
  months: MonthsTable;
  categories: CategoriesTable;
  accounts: AccountsTable;
  balance_snapshots: BalanceSnapshotsTable;
  recurring_bills: RecurringBillsTable;
  setup_progress: SetupProgressTable;
  bills: BillsTable;
  pay_schedules: PaySchedulesTable;
  paychecks: PaychecksTable;
  other_income: OtherIncomeTable;
}

export type Database = Kysely<DB>;

/** The only place a connection pool is created. `options` can set e.g. search_path. */
export function createDb(config: pg.PoolConfig): Database {
  return new Kysely<DB>({ dialect: new PostgresDialect({ pool: new pg.Pool(config) }) });
}
