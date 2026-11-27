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
  /** One card with a statement in `ym`. */
  cardId: string;
  statementId: string;
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
  'credit_cards',
  'card_statements',
] as const;

/**
 * Waits for statements sent at once, so that none is still running when the caller goes on, then
 * reports the first that failed. On Aurora DSQL each statement is a slow round trip, so tests send
 * them together. DSQL has no foreign keys (nor do the migrations), so their order is free.
 */
async function together<T>(statements: Promise<T>[]): Promise<T[]> {
  const settled = await Promise.allSettled(statements);
  return settled.map((one) => {
    if (one.status === 'rejected') throw one.reason;
    return one.value;
  });
}

export async function clearAll(db: Database): Promise<void> {
  const tables = [...HOUSEHOLD_TABLES, 'users', 'households'] as const;
  await together(tables.map((table) => db.deleteFrom(table).execute()));
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
    cardId: randomUUID(),
    statementId: randomUUID(),
    stoppedScheduleId: randomUUID(),
    inviteId: randomUUID(),
    inviteToken: `token-${label}-${randomUUID()}`,
  };
  const setupStep = label === 'A' ? 1 : 2;
  const ym = label === 'A' ? '2026-11' : '2026-10';
  const secret = `${label}-secret`;
  const h = ids.householdId;
  await together<unknown>([
    db
      .insertInto('households')
      .values({
        id: h,
        name: `${secret} household`,
        mode: 'duo',
        timezone: 'America/New_York',
        first_month: ym,
      })
      .execute(),
    db
      .insertInto('users')
      .values({
        id: ids.userId,
        email: `${label.toLowerCase()}@example.test`,
        name: `${secret} user`,
        cognito_sub: `sub-${label}`,
      })
      .execute(),
    db
      .insertInto('memberships')
      .values({ household_id: h, user_id: ids.userId, role: 'owner' })
      .execute(),
    db
      .insertInto('categories')
      .values({
        id: ids.categoryId,
        household_id: h,
        name: `${secret} category`,
        name_key: `${secret} category`.toLowerCase(),
        sort: 7,
        archived_at: null,
      })
      .execute(),
    db
      .insertInto('accounts')
      .values({
        id: ids.accountId,
        household_id: h,
        name: `${secret} account`,
        type: 'checking',
        archived_at: null,
      })
      .execute(),
    db
      .insertInto('balance_snapshots')
      .values({
        id: ids.snapshotId,
        household_id: h,
        account_id: ids.accountId,
        date: `${ym}-05`,
        balance_cents: 100_000,
        note: `${secret} note`,
      })
      .execute(),
    db
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
      .execute(),
    db
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
      .execute(),
    db
      .insertInto('months')
      .values({
        household_id: h,
        ym,
        started_at: new Date(`${ym}-01T12:00:00Z`),
        closed_at: null,
      })
      .execute(),
    // One after the other: `created_at` puts the running schedule first.
    db
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
      .execute()
      .then(() =>
        db
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
          .execute(),
      ),
    db
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
      .execute(),
    db
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
      .execute(),
    db
      .insertInto('credit_cards')
      .values({
        id: ids.cardId,
        household_id: h,
        nickname: `${secret} card`,
        due_day: 22,
        usual_plan: 'full',
        archived_at: null,
      })
      .execute(),
    db
      .insertInto('card_statements')
      .values({
        id: ids.statementId,
        household_id: h,
        card_id: ids.cardId,
        ym,
        statement_cents: 80_000,
        minimum_cents: 2_500,
        planned_payment_cents: 80_000,
        paid_cents: null,
        paid_at: null,
      })
      .execute(),
    db
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
      .execute(),
    db
      .insertInto('setup_progress')
      .values({ household_id: h, step: setupStep, status: 'done' })
      .execute(),
  ]);
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
  const rows = await together([
    db
      .selectFrom('households')
      .selectAll()
      .where('id', '=', s.householdId)
      .execute()
      .then((set) => set.map((r) => JSON.stringify(r))),
    db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', s.userId)
      .execute()
      .then((set) => set.map((r) => JSON.stringify(r))),
    ...HOUSEHOLD_TABLES.map(async (table) => {
      const result = await sql<
        Record<string, unknown>
      >`SELECT * FROM ${sql.table(table)} WHERE household_id = ${s.householdId}`.execute(db);
      return result.rows.map((r) => `${table}:${JSON.stringify(r)}`);
    }),
  ]);
  return rows.flat().sort();
}
