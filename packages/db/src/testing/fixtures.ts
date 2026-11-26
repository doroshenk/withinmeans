import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { HouseholdContext } from '../context.js';
import type { Database } from '../db.js';

/** One fully populated household. Every text value carries `<label>-secret` so leaks are visible. */
export interface Seeded {
  label: 'A' | 'B';
  householdId: string;
  userId: string;
  categoryId: string;
  accountId: string;
  snapshotId: string;
  recurringBillId: string;
  billId: string;
  payScheduleId: string;
  paycheckId: string;
  otherIncomeId: string;
  /** A second schedule, already stopped, with no paychecks. */
  stoppedScheduleId: string;
  inviteId: string;
  inviteToken: string;
  /** The one finished setup step seeded for this household (A: 1, B: 2). */
  setupStep: number;
  /** Different per household so a month leak is detectable. */
  ym: string;
  ctx(role?: HouseholdContext['role']): HouseholdContext;
}

/** Tables whose rows carry a household_id column. */
export const HOUSEHOLD_TABLES = [
  'memberships',
  'invites',
  'months',
  'categories',
  'accounts',
  'balance_snapshots',
  'recurring_bills',
  'setup_progress',
  'bills',
  'pay_schedules',
  'paychecks',
  'other_income',
] as const;

export async function clearAll(db: Database): Promise<void> {
  for (const table of HOUSEHOLD_TABLES) await db.deleteFrom(table).execute();
  await db.deleteFrom('users').execute();
  await db.deleteFrom('households').execute();
}

export async function seedHousehold(db: Database, label: 'A' | 'B'): Promise<Seeded> {
  const ids = {
    householdId: randomUUID(),
    userId: randomUUID(),
    categoryId: randomUUID(),
    accountId: randomUUID(),
    snapshotId: randomUUID(),
    recurringBillId: randomUUID(),
    billId: randomUUID(),
    payScheduleId: randomUUID(),
    paycheckId: randomUUID(),
    otherIncomeId: randomUUID(),
    stoppedScheduleId: randomUUID(),
    inviteId: randomUUID(),
    inviteToken: `token-${label}-${randomUUID()}`,
  };
  const setupStep = label === 'A' ? 1 : 2;
  const ym = label === 'A' ? '2026-11' : '2026-10';
  const secret = `${label}-secret`;
  const h = ids.householdId;
  await db
    .insertInto('households')
    .values({
      id: h,
      name: `${secret} household`,
      mode: 'duo',
      timezone: 'America/New_York',
      first_month: ym,
    })
    .execute();
  await db
    .insertInto('users')
    .values({
      id: ids.userId,
      email: `${label.toLowerCase()}@example.test`,
      name: `${secret} user`,
      cognito_sub: `sub-${label}`,
    })
    .execute();
  await db
    .insertInto('memberships')
    .values({ household_id: h, user_id: ids.userId, role: 'owner' })
    .execute();
  await db
    .insertInto('categories')
    .values({
      id: ids.categoryId,
      household_id: h,
      name: `${secret} category`,
      name_key: `${secret} category`.toLowerCase(),
      sort: 7,
      archived_at: null,
    })
    .execute();
  await db
    .insertInto('accounts')
    .values({
      id: ids.accountId,
      household_id: h,
      name: `${secret} account`,
      type: 'checking',
      archived_at: null,
    })
    .execute();
  await db
    .insertInto('balance_snapshots')
    .values({
      id: ids.snapshotId,
      household_id: h,
      account_id: ids.accountId,
      date: `${ym}-05`,
      balance_cents: 100_000,
      note: `${secret} note`,
    })
    .execute();
  await db
    .insertInto('recurring_bills')
    .values({
      id: ids.recurringBillId,
      household_id: h,
      name: `${secret} bill`,
      estimate_cents: 50_000,
      due_day: 1,
      category_id: ids.categoryId,
      account_id: ids.accountId,
      start_ym: ym,
      end_ym: null,
    })
    .execute();
  await db
    .insertInto('bills')
    .values({
      id: ids.billId,
      household_id: h,
      ym,
      recurring_bill_id: ids.recurringBillId,
      name: `${secret} bill`,
      category_id: ids.categoryId,
      due_date: `${ym}-01`,
      estimate_cents: 50_000,
      actual_cents: null,
      paid_at: null,
      kind: 'recurring',
    })
    .execute();
  await db
    .insertInto('months')
    .values({
      household_id: h,
      ym,
      started_at: new Date(`${ym}-01T12:00:00Z`),
      closed_at: null,
    })
    .execute();
  await db
    .insertInto('pay_schedules')
    .values({
      id: ids.payScheduleId,
      household_id: h,
      name: `${secret} job`,
      frequency: 'monthly',
      anchor_date: `${ym}-25`,
      semimonthly_day_1: null,
      semimonthly_day_2: null,
      usual_cents: 200_000,
      account_id: ids.accountId,
      ended_on: null,
    })
    .execute();
  await db
    .insertInto('pay_schedules')
    .values({
      id: ids.stoppedScheduleId,
      household_id: h,
      name: `${secret} old job`,
      frequency: 'monthly',
      anchor_date: `${ym}-27`,
      semimonthly_day_1: null,
      semimonthly_day_2: null,
      usual_cents: 100_000,
      account_id: null,
      ended_on: `${ym}-02`,
    })
    .execute();
  await db
    .insertInto('paychecks')
    .values({
      id: ids.paycheckId,
      household_id: h,
      schedule_id: ids.payScheduleId,
      expected_date: `${ym}-25`,
      expected_cents: 200_000,
      received_date: null,
      received_cents: null,
    })
    .execute();
  await db
    .insertInto('other_income')
    .values({
      id: ids.otherIncomeId,
      household_id: h,
      date: `${ym}-12`,
      source: `${secret} sale`,
      type: 'sale',
      amount_cents: 12_000,
      account_id: ids.accountId,
      note: `${secret} income note`,
    })
    .execute();
  await db
    .insertInto('invites')
    .values({
      id: ids.inviteId,
      household_id: h,
      name: `${secret} invitee`,
      email: `invitee-${label.toLowerCase()}@example.test`,
      role: 'view',
      token: ids.inviteToken,
      expires_at: new Date('2026-12-01T00:00:00Z'),
      accepted_at: null,
      invited_by: ids.userId,
    })
    .execute();
  await db
    .insertInto('setup_progress')
    .values({ household_id: h, step: setupStep, status: 'done' })
    .execute();
  return {
    label,
    ...ids,
    setupStep,
    ym,
    ctx: (role = 'owner') => ({ householdId: h, userId: ids.userId, role }),
  };
}

/** Every row that belongs to the household, from every table, in a stable order. */
export async function snapshotHousehold(db: Database, s: Seeded): Promise<string[]> {
  const rows: string[] = [];
  const own = [
    await db.selectFrom('households').selectAll().where('id', '=', s.householdId).execute(),
    await db.selectFrom('users').selectAll().where('id', '=', s.userId).execute(),
  ];
  for (const set of own) for (const r of set) rows.push(JSON.stringify(r));
  for (const table of HOUSEHOLD_TABLES) {
    const result = await sql<
      Record<string, unknown>
    >`SELECT * FROM ${sql.table(table)} WHERE household_id = ${s.householdId}`.execute(db);
    for (const r of result.rows) rows.push(`${table}:${JSON.stringify(r)}`);
  }
  return rows.sort();
}
