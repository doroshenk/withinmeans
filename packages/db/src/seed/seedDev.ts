/**
 * The spec §10 sample data ("Our household", today = Wed Nov 18, 2026) for the dev stage. Every
 * record goes in through its repository, except the household and its members, which need a fixed
 * id. Due days, categories, account names and balances are not in §10: they follow design/.
 */
import { DEFAULT_CATEGORIES, type OtherIncomeType } from '@withinmeans/domain';
import type { HouseholdContext, Role } from '../context.js';
import type { Database } from '../db.js';
import { accounts } from '../repos/accounts.js';
import { categories } from '../repos/categories.js';
import { householdExport } from '../repos/householdExport.js';
import { households } from '../repos/households.js';
import { openMonth } from '../repos/openMonth.js';
import { otherIncome } from '../repos/otherIncome.js';
import { paychecks } from '../repos/paychecks.js';
import { paySchedules } from '../repos/paySchedules.js';
import { recurringBills } from '../repos/recurringBills.js';
import { setupProgress } from '../repos/setupProgress.js';

/** The seeded household always has this id, so that a re-run finds it. */
export const SEED_HOUSEHOLD_ID = '5eed0000-0000-4000-8000-000000000001';

export interface SeedOptions {
  /** When the seeded month was started. */
  now: Date;
  /** Rebuilds the seeded household if it is there already. */
  reset?: boolean;
  /** An existing dev login to be the owner, so that someone can sign in and look. */
  ownerEmail?: string;
  /** Allows that login to be moved out of the household it is in. */
  leaveHousehold?: boolean;
}

export interface SeedResult {
  householdId: string;
  ownerEmail: string;
}

const YM = '2026-11';

/** The made-up people. No Cognito login has these subs, so nobody can sign in as them. */
const JOHN = { name: 'John', email: 'john@example.test', cognito_sub: 'seed:john' };
const PARTNER = { name: 'Sam', email: 'partner@example.test', cognito_sub: 'seed:partner' };

/** [name, cents, due day, category, autopay] */
const BILLS: readonly (readonly [string, number, number, string, boolean])[] = [
  ['Mortgage', 185_000, 1, 'Housing', true],
  ['Pool service', 12_000, 3, 'Home', false],
  ['Electric', 16_400, 5, 'Utilities', true],
  ['Internet', 8_000, 9, 'Utilities', true],
  ['Phone', 9_500, 11, 'Utilities', true],
  ['Car insurance', 14_200, 13, 'Insurance', true],
  ['Water & sewer', 6_800, 18, 'Utilities', false],
  ['CD contribution · 1', 2_000, 20, 'Savings', false],
  ['CD contribution · 2', 2_000, 20, 'Savings', false],
  ['Lawn supplies', 4_500, 21, 'Home', false],
  ['HOA dues', 11_000, 25, 'Housing', false],
  ['Streaming', 3_600, 28, 'Subscriptions', true],
];

const INCOME: readonly {
  date: string;
  source: string;
  type: OtherIncomeType;
  amountCents: number;
  into: 'checking' | 'cash';
}[] = [
  {
    date: '2026-11-03',
    source: 'Freelance web work',
    type: 'side_work',
    amountCents: 35_000,
    into: 'checking',
  },
  {
    date: '2026-11-12',
    source: 'Marketplace sale',
    type: 'sale',
    amountCents: 12_000,
    into: 'cash',
  },
  {
    date: '2026-11-15',
    source: 'Insurance refund',
    type: 'refund',
    amountCents: 6_420,
    into: 'checking',
  },
];

interface Member {
  userId: string;
  role: Role;
}

/** The members of the seeded household who have a real login. */
async function realMembers(db: Database): Promise<Member[]> {
  return db
    .selectFrom('memberships')
    .innerJoin('users', 'users.id', 'memberships.user_id')
    .select(['memberships.user_id as userId', 'memberships.role'])
    .where('memberships.household_id', '=', SEED_HOUSEHOLD_ID)
    .where('users.cognito_sub', 'not in', [JOHN.cognito_sub, PARTNER.cognito_sub])
    .execute();
}

/** The dev login with this email, checked before anything changes. */
async function loginFor(db: Database, email: string, leave: boolean): Promise<string> {
  const user = await db
    .selectFrom('users')
    .select('id')
    .where('email', '=', email.trim().toLowerCase())
    .executeTakeFirst();
  if (user === undefined) {
    throw new Error('No dev login has that email: sign up on the dev site first');
  }
  const elsewhere = await db
    .selectFrom('memberships')
    .select('household_id')
    .where('user_id', '=', user.id)
    .where('household_id', '<>', SEED_HOUSEHOLD_ID)
    .executeTakeFirst();
  if (elsewhere !== undefined && !leave) {
    throw new Error(
      'That login already belongs to a household: add --leave-household to move it here',
    );
  }
  return user.id;
}

/** Removes the seeded household and every row of it, and nothing else. */
async function wipe(db: Database, ctx: HouseholdContext): Promise<void> {
  // The export lists every household-scoped table (a test holds it to that), so none is missed.
  const tables = Object.keys(await householdExport.read(db, ctx)).filter((n) => n !== 'households');
  for (const table of tables) {
    await db
      .deleteFrom(table as 'months')
      .where('household_id', '=', ctx.householdId)
      .execute();
  }
  await households.remove(db, ctx);
}

async function madeUpUser(db: Database, user: typeof JOHN): Promise<string> {
  await db
    .insertInto('users')
    .values(user)
    .onConflict((oc) => oc.column('cognito_sub').doNothing())
    .execute();
  const row = await db
    .selectFrom('users')
    .select('id')
    .where('cognito_sub', '=', user.cognito_sub)
    .executeTakeFirstOrThrow();
  return row.id;
}

/**
 * Who is in the household: the real logins it had, with the asked-for one as owner. John stands in
 * when no real login owns it, and the partner when there is nobody else.
 */
async function membersFor(
  db: Database,
  kept: Member[],
  ownerId: string | undefined,
): Promise<Member[]> {
  const members =
    ownerId === undefined
      ? [...kept]
      : [
          { userId: ownerId, role: 'owner' as const },
          ...kept
            .filter((m) => m.userId !== ownerId)
            .map((m) => ({ ...m, role: m.role === 'owner' ? ('full' as const) : m.role })),
        ];
  if (!members.some((m) => m.role === 'owner')) {
    members.push({ userId: await madeUpUser(db, JOHN), role: 'owner' });
  }
  // A household is one or two people.
  if (members.length < 2) {
    members.push({ userId: await madeUpUser(db, PARTNER), role: 'full' });
  }
  return members;
}

async function addRecords(db: Database, ctx: HouseholdContext, now: Date): Promise<void> {
  const checking = await accounts.createWithBalance(db, ctx, {
    name: 'Everyday checking',
    type: 'checking',
    balanceCents: 107_212,
    date: '2026-11-18',
  });
  await accounts.createWithBalance(db, ctx, {
    name: 'High-yield savings',
    type: 'savings',
    balanceCents: 500_000,
    date: '2026-11-18',
  });
  const cash = await accounts.createWithBalance(db, ctx, {
    name: 'Cash',
    type: 'cash',
    balanceCents: 12_000,
    date: '2026-11-18',
  });
  await households.setCushion(db, ctx, 100_000);

  await categories.seedDefaults(db, ctx, DEFAULT_CATEGORIES);
  const ids = new Map((await categories.list(db, ctx)).map((c) => [c.name, c.id]));
  for (const [name, estimateCents, dueDay, category, autopay] of BILLS) {
    const categoryId = ids.get(category);
    if (categoryId === undefined) throw new Error(`No category "${category}"`);
    await recurringBills.create(db, ctx, {
      name,
      estimateCents,
      dueDay,
      categoryId,
      autopay,
      accountId: checking.id,
      startYm: YM,
    });
  }

  await paySchedules.create(db, ctx, {
    name: 'Main job',
    frequency: 'biweekly',
    anchorDate: '2026-11-06',
    usualCents: 322_500,
    accountId: checking.id,
  });
  await openMonth(db, ctx, YM, now);
  const [first] = await paychecks.listForMonth(db, ctx, YM);
  if (first === undefined) throw new Error('November has no paycheck');
  await paychecks.markReceived(db, ctx, first.id, {
    receivedCents: 327_218,
    receivedDate: '2026-11-06',
  });

  for (const { into, ...entry } of INCOME) {
    await otherIncome.create(db, ctx, {
      ...entry,
      accountId: into === 'cash' ? cash.id : checking.id,
    });
  }

  for (const step of [1, 2, 3, 4, 5, 9]) await setupProgress.save(db, ctx, step, 'done');
  await setupProgress.save(db, ctx, 6, 'skipped');
}

/** Loads the sample data. Only the seed command calls this, and only for the dev stage. */
export async function seedDev(db: Database, options: SeedOptions): Promise<SeedResult> {
  const existing = await db
    .selectFrom('households')
    .select('id')
    .where('id', '=', SEED_HOUSEHOLD_ID)
    .executeTakeFirst();
  if (existing !== undefined && options.reset !== true) {
    throw new Error('Dev is already seeded: add --reset to rebuild "Our household"');
  }
  const ownerId =
    options.ownerEmail === undefined
      ? undefined
      : await loginFor(db, options.ownerEmail, options.leaveHousehold === true);

  // The context the repositories take; the user id is filled in once the owner is known.
  const ctx: HouseholdContext = {
    householdId: SEED_HOUSEHOLD_ID,
    userId: '00000000-0000-0000-0000-000000000000',
    role: 'owner',
  };
  const kept = await realMembers(db);
  await wipe(db, ctx);

  await db
    .insertInto('households')
    .values({
      id: SEED_HOUSEHOLD_ID,
      name: 'Our household',
      mode: 'duo',
      timezone: 'America/New_York',
      first_month: YM,
    })
    .execute();
  const members = await membersFor(db, kept, ownerId);
  // A login is in one household, so the new owner leaves any other.
  if (ownerId !== undefined) {
    await db.deleteFrom('memberships').where('user_id', '=', ownerId).execute();
  }
  await db
    .insertInto('memberships')
    .values(
      members.map((m) => ({ household_id: SEED_HOUSEHOLD_ID, user_id: m.userId, role: m.role })),
    )
    .execute();

  const owner = await db
    .selectFrom('users')
    .select(['id', 'email'])
    .where('id', '=', members.find((m) => m.role === 'owner')?.userId ?? '')
    .executeTakeFirstOrThrow();
  await addRecords(db, { ...ctx, userId: owner.id }, options.now);
  return { householdId: SEED_HOUSEHOLD_ID, ownerEmail: owner.email };
}
