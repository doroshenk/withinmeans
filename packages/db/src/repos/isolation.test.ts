import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Forbidden, NotFound, type HouseholdContext } from '../context.js';
import type { Database } from '../db.js';
import { clearAll, seedHousehold, snapshotHousehold, type Seeded } from '../testing/fixtures.js';
import { createTestDb, type TestDb } from '../testing/harness.js';
import { accounts } from './accounts.js';
import { balanceSnapshots } from './balanceSnapshots.js';
import { categories } from './categories.js';
import { householdExport } from './householdExport.js';
import { invites } from './invites.js';
import { memberships } from './memberships.js';
import { months } from './months.js';
import { openMonth } from './openMonth.js';
import { paychecks } from './paychecks.js';
import { paySchedules } from './paySchedules.js';
import { recurringBills } from './recurringBills.js';
import { setupProgress } from './setupProgress.js';

/**
 * The isolation suite (P1-01). Every function of every new repository is listed here once:
 *  - reads: household A's context aimed at B's ids must return none of B's data, and A's own data
 *    must still come back (so the check cannot pass on an empty result);
 *  - writes: A's context aimed at B's ids must leave B's rows byte-for-byte unchanged (and reject
 *    with NotFound when the call names a B id); with A's own ids the call must work, and with the
 *    `view` role it must throw Forbidden and change nothing.
 * A test at the bottom fails when a repository function is missing from this table.
 */
interface Case {
  name: string;
  write: boolean;
  /** A write that names an id from `t`: aimed at B's id it must reject with NotFound. */
  namesId?: boolean;
  /** Text proving the result holds `t`'s data (defaults to `<label>-secret`). */
  marker?: (t: Seeded) => string;
  /** Puts `t`'s data (as its owner) in the state a write needs, before it is looked at. */
  prepare?: (db: Database, t: Seeded) => Promise<unknown>;
  run(db: Database, ctx: HouseholdContext, t: Seeded): Promise<unknown>;
}

const newInvite = () => ({
  name: 'Pat',
  email: 'pat@example.test',
  role: 'full' as const,
  note: '',
  token: `tok-${randomUUID()}`,
  expiresAt: new Date('2026-12-01T00:00:00Z'),
});

const cases: Case[] = [
  { name: 'memberships.list', write: false, run: (db, ctx) => memberships.list(db, ctx) },

  { name: 'invites.listPending', write: false, run: (db, ctx) => invites.listPending(db, ctx) },
  { name: 'invites.create', write: true, run: (db, ctx) => invites.create(db, ctx, newInvite()) },
  {
    name: 'invites.reissue',
    write: true,
    namesId: true,
    run: (db, ctx, t) =>
      invites.reissue(db, ctx, t.inviteId, {
        token: `tok-${randomUUID()}`,
        expiresAt: new Date('2026-12-02T00:00:00Z'),
      }),
  },
  {
    name: 'invites.revoke',
    write: true,
    namesId: true,
    run: (db, ctx, t) => invites.revoke(db, ctx, t.inviteId),
  },

  {
    name: 'months.list',
    write: false,
    marker: (t) => t.ym,
    run: (db, ctx) => months.list(db, ctx),
  },
  {
    name: 'months.get',
    write: false,
    marker: (t) => t.ym,
    run: (db, ctx, t) => months.get(db, ctx, t.ym),
  },
  {
    name: 'months.insert',
    write: true,
    run: (db, ctx) => months.insert(db, ctx, '2026-12', new Date('2026-12-01T12:00:00Z')),
  },
  {
    name: 'months.openMonth',
    write: true,
    run: (db, ctx) => openMonth(db, ctx, '2026-12', new Date('2026-12-01T12:00:00Z')),
  },

  { name: 'categories.list', write: false, run: (db, ctx) => categories.list(db, ctx) },
  {
    name: 'categories.create',
    write: true,
    run: (db, ctx) => categories.create(db, ctx, { name: 'Fun', colorIndex: 2 }),
  },
  {
    name: 'categories.rename',
    write: true,
    namesId: true,
    run: (db, ctx, t) => categories.rename(db, ctx, t.categoryId, 'Renamed'),
  },
  {
    name: 'categories.setColor',
    write: true,
    namesId: true,
    run: (db, ctx, t) => categories.setColor(db, ctx, t.categoryId, 5),
  },
  {
    name: 'categories.reorder',
    write: true,
    namesId: true,
    run: (db, ctx, t) => categories.reorder(db, ctx, [t.categoryId]),
  },
  {
    name: 'categories.listWithUsage',
    write: false,
    run: (db, ctx) => categories.listWithUsage(db, ctx),
  },
  {
    name: 'categories.seedDefaults',
    write: true,
    run: async (db, ctx) => {
      // It only seeds an empty household, so empty this one first (not for the view role: that
      // call must change nothing, so the repo's own role check has to be what stops it).
      if (ctx.role !== 'view') {
        await db.deleteFrom('categories').where('household_id', '=', ctx.householdId).execute();
      }
      return categories.seedDefaults(db, ctx, ['Housing']);
    },
  },
  {
    name: 'categories.remove',
    write: true,
    namesId: true,
    run: async (db, ctx, t) => {
      // Needs a second category to move bills to, since the last one cannot be deleted.
      await categories.create(db, ctx, { name: 'Spare', colorIndex: 4 });
      return categories.remove(db, ctx, t.categoryId);
    },
  },
  {
    name: 'categories.archive',
    write: true,
    namesId: true,
    run: (db, ctx, t) => categories.archive(db, ctx, t.categoryId),
  },

  { name: 'accounts.list', write: false, run: (db, ctx) => accounts.list(db, ctx) },
  {
    name: 'accounts.create',
    write: true,
    run: (db, ctx) => accounts.create(db, ctx, { name: 'Savings', type: 'savings' }),
  },
  {
    name: 'accounts.listWithBalance',
    write: false,
    run: (db, ctx) => accounts.listWithBalance(db, ctx),
  },
  {
    name: 'accounts.createWithBalance',
    write: true,
    run: (db, ctx) =>
      accounts.createWithBalance(db, ctx, {
        name: 'Joint',
        type: 'checking',
        balanceCents: 5_000,
        date: '2026-11-18',
      }),
  },
  {
    name: 'accounts.rename',
    write: true,
    namesId: true,
    run: (db, ctx, t) => accounts.rename(db, ctx, t.accountId, 'Renamed'),
  },
  {
    name: 'accounts.setPrimaryChecking',
    write: true,
    namesId: true,
    run: (db, ctx, t) => accounts.setPrimaryChecking(db, ctx, t.accountId),
  },
  {
    name: 'accounts.archive',
    write: true,
    namesId: true,
    run: (db, ctx, t) => accounts.archive(db, ctx, t.accountId),
  },

  {
    name: 'balanceSnapshots.listForAccount',
    write: false,
    run: (db, ctx, t) => balanceSnapshots.listForAccount(db, ctx, t.accountId),
  },
  {
    name: 'balanceSnapshots.latest',
    write: false,
    run: (db, ctx, t) => balanceSnapshots.latest(db, ctx, t.accountId),
  },
  {
    name: 'balanceSnapshots.add',
    write: true,
    namesId: true,
    run: (db, ctx, t) =>
      balanceSnapshots.add(db, ctx, {
        accountId: t.accountId,
        date: '2026-11-18',
        balanceCents: 1_000,
        note: '',
      }),
  },

  { name: 'recurringBills.list', write: false, run: (db, ctx) => recurringBills.list(db, ctx) },
  {
    name: 'recurringBills.create',
    write: true,
    namesId: true,
    run: (db, ctx, t) =>
      recurringBills.create(db, ctx, {
        name: 'Phone',
        estimateCents: 6_000,
        dueDay: 5,
        categoryId: t.categoryId,
        autopay: true,
        accountId: t.accountId,
        startYm: '2026-11',
      }),
  },
  {
    name: 'recurringBills.update',
    write: true,
    namesId: true,
    run: (db, ctx, t) => recurringBills.update(db, ctx, t.recurringBillId, { name: 'Renamed' }),
  },
  {
    name: 'recurringBills.end',
    write: true,
    namesId: true,
    run: (db, ctx, t) => recurringBills.end(db, ctx, t.recurringBillId, '2027-01'),
  },
  {
    name: 'recurringBills.stop',
    write: true,
    namesId: true,
    run: (db, ctx, t) => recurringBills.stop(db, ctx, t.recurringBillId, '2026-11'),
  },
  {
    name: 'recurringBills.restart',
    write: true,
    namesId: true,
    // Only an ended bill changes.
    prepare: (db, t) => recurringBills.end(db, t.ctx(), t.recurringBillId, t.ym),
    run: (db, ctx, t) => recurringBills.restart(db, ctx, t.recurringBillId, '2026-11'),
  },
  {
    name: 'categories.usedIds',
    write: false,
    marker: (t) => t.categoryId,
    run: (db, ctx) => categories.usedIds(db, ctx),
  },
  {
    name: 'recurringBills.remove',
    write: true,
    namesId: true,
    run: (db, ctx, t) => recurringBills.remove(db, ctx, t.recurringBillId, '2026-11'),
  },

  { name: 'paySchedules.list', write: false, run: (db, ctx) => paySchedules.list(db, ctx) },
  {
    name: 'paySchedules.create',
    write: true,
    namesId: true,
    run: (db, ctx, t) =>
      paySchedules.create(db, ctx, {
        name: 'Side job',
        frequency: 'weekly',
        anchorDate: '2026-11-06',
        usualCents: 10_000,
        accountId: t.accountId,
      }),
  },
  {
    name: 'paySchedules.remove',
    write: true,
    namesId: true,
    run: (db, ctx, t) => paySchedules.remove(db, ctx, t.stoppedScheduleId),
  },
  {
    name: 'paySchedules.stop',
    write: true,
    namesId: true,
    run: (db, ctx, t) => paySchedules.stop(db, ctx, t.payScheduleId, '2026-09-30'),
  },
  {
    name: 'paySchedules.restart',
    write: true,
    namesId: true,
    run: (db, ctx, t) => paySchedules.restart(db, ctx, t.stoppedScheduleId, '2026-11-18'),
  },

  {
    name: 'paychecks.listForMonth',
    write: false,
    marker: (t) => t.paycheckId,
    run: (db, ctx, t) => paychecks.listForMonth(db, ctx, t.ym),
  },
  {
    name: 'paychecks.markReceived',
    write: true,
    namesId: true,
    run: (db, ctx, t) =>
      paychecks.markReceived(db, ctx, t.paycheckId, {
        receivedCents: 201_000,
        receivedDate: '2026-11-18',
      }),
  },

  {
    name: 'setupProgress.list',
    write: false,
    marker: (t) => `"step":${t.setupStep}`,
    run: (db, ctx) => setupProgress.list(db, ctx),
  },
  {
    name: 'setupProgress.save',
    write: true,
    run: (db, ctx) => setupProgress.save(db, ctx, 4, 'done'),
  },

  { name: 'householdExport.read', write: false, run: (db, ctx) => householdExport.read(db, ctx) },
];

/**
 * `signUp.createHousehold` is deliberately not in this table: it runs before any household
 * exists, takes no HouseholdContext and only inserts brand-new rows (see repos/signUp.ts).
 */

/**
 * Not scoped to one household: `invites.findByToken` is looked up by a secret token (tests in
 * core.test.ts); `householdExport.listContexts` is the nightly job's list of every household
 * (tests in householdExport.test.ts).
 */
const NOT_HOUSEHOLD_SCOPED = ['invites.findByToken', 'householdExport.listContexts'];

let t: TestDb;
let A: Seeded;
let B: Seeded;

beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.destroy();
});
beforeEach(async () => {
  await clearAll(t.db);
  A = await seedHousehold(t.db, 'A');
  B = await seedHousehold(t.db, 'B');
});

const marker = (c: Case, s: Seeded) => c.marker?.(s) ?? `${s.label}-secret`;
/** JSON.stringify(undefined) is undefined; an empty result should read as text. */
const show = (value: unknown): string => JSON.stringify(value) ?? 'none';
const reads = cases.filter((c) => !c.write);
const writes = cases.filter((c) => c.write);

describe('P1-01 isolation: reads', () => {
  it.each(reads.map((c) => [c.name, c] as const))(
    '%s: A sees A data and never B data',
    async (_name, c) => {
      expect(show(await c.run(t.db, A.ctx(), A))).toContain(marker(c, A));
      expect(show(await c.run(t.db, A.ctx(), B))).not.toContain(marker(c, B));
    },
  );
  it.each(reads.map((c) => [c.name, c] as const))(
    '%s: a view-only member can read',
    async (_name, c) => {
      expect(show(await c.run(t.db, A.ctx('view'), A))).toContain(marker(c, A));
    },
  );
});

describe('P1-01 isolation: writes', () => {
  it.each(writes.map((c) => [c.name, c] as const))(
    "%s: works on A's own data",
    async (_name, c) => {
      await c.prepare?.(t.db, A);
      const before = await snapshotHousehold(t.db, A);
      await c.run(t.db, A.ctx(), A);
      expect(await snapshotHousehold(t.db, A)).not.toEqual(before);
    },
  );
  it.each(writes.map((c) => [c.name, c] as const))(
    "%s: A cannot change B's data",
    async (_name, c) => {
      await c.prepare?.(t.db, B);
      const before = await snapshotHousehold(t.db, B);
      const attempt = c.run(t.db, A.ctx(), B);
      if (c.namesId === true) await expect(attempt).rejects.toBeInstanceOf(NotFound);
      else await attempt;
      expect(await snapshotHousehold(t.db, B)).toEqual(before);
    },
  );
  it.each(writes.map((c) => [c.name, c] as const))(
    '%s: the view role is rejected and nothing changes',
    async (_name, c) => {
      await c.prepare?.(t.db, A);
      const before = await snapshotHousehold(t.db, A);
      await expect(c.run(t.db, A.ctx('view'), A)).rejects.toBeInstanceOf(Forbidden);
      expect(await snapshotHousehold(t.db, A)).toEqual(before);
    },
  );
});

describe('P1-01 isolation: coverage of the table', () => {
  it('lists every function of every new repository', () => {
    const repos = {
      memberships,
      invites,
      months: { ...months, openMonth },
      categories,
      accounts,
      balanceSnapshots,
      recurringBills,
      paySchedules,
      paychecks,
      setupProgress,
      householdExport,
    };
    const everyFunction = Object.entries(repos).flatMap(([repo, fns]) =>
      Object.keys(fns).map((fn) => `${repo}.${fn}`),
    );
    const covered = [...cases.map((c) => c.name), ...NOT_HOUSEHOLD_SCOPED];
    expect(everyFunction.filter((f) => !covered.includes(f))).toEqual([]);
    expect(covered.filter((f) => !everyFunction.includes(f))).toEqual([]);
  });
});
