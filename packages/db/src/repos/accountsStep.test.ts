import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Forbidden, InvalidInput } from '../context.js';
import { clearAll, seedHousehold, type Seeded } from '../testing/fixtures.js';
import { createTestDb, type TestDb } from '../testing/harness.js';
import { accounts } from './accounts.js';
import { balanceSnapshots } from './balanceSnapshots.js';
import { households } from './households.js';

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
  // Start from no accounts: the seeded one would only get in the way.
  await t.db.deleteFrom('balance_snapshots').where('household_id', '=', A.householdId).execute();
  await t.db.deleteFrom('accounts').where('household_id', '=', A.householdId).execute();
});

const add = (name: string, type: 'checking' | 'savings' | 'cash', balanceCents: number) =>
  accounts.createWithBalance(t.db, A.ctx(), { name, type, balanceCents, date: '2026-11-18' });

describe('P1-10 createWithBalance', () => {
  it('creates the account and its first snapshot with the balance and date', async () => {
    const account = await add('Joint', 'checking', 123_456);

    const snaps = await balanceSnapshots.listForAccount(t.db, A.ctx(), account.id);
    expect(snaps).toHaveLength(1);
    expect(snaps[0]).toMatchObject({ balance_cents: 123_456 });
    expect(String(snaps[0]?.date)).toContain('2026-11-18');
  });

  it('keeps a negative balance as it was entered', async () => {
    const account = await add('Overdrawn', 'checking', -1_480);
    expect((await balanceSnapshots.latest(t.db, A.ctx(), account.id))?.balance_cents).toBe(-1_480);
  });

  it('the first checking account becomes is_primary_checking; the second does not', async () => {
    const first = await add('Joint', 'checking', 100_000);
    const second = await add('Spending', 'checking', 20_000);

    expect(first.is_primary_checking).toBe(true);
    expect(second.is_primary_checking).toBe(false);
    const primary = (await accounts.list(t.db, A.ctx())).filter((a) => a.is_primary_checking);
    expect(primary.map((a) => a.name)).toEqual(['Joint']);
  });

  it('a savings or cash account first does not take the primary spot', async () => {
    const savings = await add('Rainy day', 'savings', 500_000);
    const cash = await add('Wallet', 'cash', 4_000);
    const checking = await add('Joint', 'checking', 100_000);

    expect([savings, cash].map((a) => a.is_primary_checking)).toEqual([false, false]);
    expect(checking.is_primary_checking).toBe(true);
  });

  it('a rejected snapshot leaves no account behind (one transaction)', async () => {
    await expect(
      accounts.createWithBalance(t.db, A.ctx(), {
        name: 'Bad',
        type: 'checking',
        balanceCents: 1.5,
        date: '2026-11-18',
      }),
    ).rejects.toBeInstanceOf(InvalidInput);
    expect(await accounts.list(t.db, A.ctx())).toEqual([]);
  });

  it('a blank name is invalid; a view-only member is Forbidden', async () => {
    await expect(add('  ', 'checking', 0)).rejects.toBeInstanceOf(InvalidInput);
    await expect(
      accounts.createWithBalance(t.db, A.ctx('view'), {
        name: 'X',
        type: 'checking',
        balanceCents: 0,
        date: '2026-11-18',
      }),
    ).rejects.toBeInstanceOf(Forbidden);
  });
});

describe('P1-10 listWithBalance', () => {
  it('returns active accounts with their latest balance, in creation order', async () => {
    const joint = await add('Joint', 'checking', 100_000);
    await add('Rainy day', 'savings', 500_000);
    await balanceSnapshots.add(t.db, A.ctx(), {
      accountId: joint.id,
      date: '2026-11-19',
      balanceCents: 90_000,
      note: '',
    });

    const rows = await accounts.listWithBalance(t.db, A.ctx());
    expect(rows.map((r) => [r.name, r.balance_cents])).toEqual([
      ['Joint', 90_000],
      ['Rainy day', 500_000],
    ]);
  });

  it('leaves out archived accounts and other households', async () => {
    const gone = await add('Old', 'cash', 100);
    await accounts.archive(t.db, A.ctx(), gone.id);

    expect(await accounts.listWithBalance(t.db, A.ctx())).toEqual([]);
    expect((await accounts.listWithBalance(t.db, B.ctx())).map((r) => r.id)).toEqual([B.accountId]);
  });
});

describe('P1-10 archiving the primary checking account', () => {
  it('promotes the next checking account', async () => {
    const first = await add('Joint', 'checking', 100_000);
    await add('Savings', 'savings', 1);
    const next = await add('Spending', 'checking', 20_000);

    await accounts.archive(t.db, A.ctx(), first.id);

    const primary = (await accounts.list(t.db, A.ctx())).filter((a) => a.is_primary_checking);
    expect(primary.map((a) => a.id)).toEqual([next.id]);
  });

  it('with no other checking account, nothing is primary', async () => {
    const only = await add('Joint', 'checking', 100_000);
    await accounts.archive(t.db, A.ctx(), only.id);
    expect((await accounts.list(t.db, A.ctx())).filter((a) => a.is_primary_checking)).toEqual([]);
  });

  it('a new checking account then becomes primary', async () => {
    const only = await add('Joint', 'checking', 100_000);
    await accounts.archive(t.db, A.ctx(), only.id);
    expect((await add('New', 'checking', 5)).is_primary_checking).toBe(true);
  });
});

describe('P1-10 setCushion', () => {
  it('saves the cushion for the household only', async () => {
    await households.setCushion(t.db, A.ctx(), 100_000);

    expect((await households.getMine(t.db, A.ctx()))?.cushion_cents).toBe(100_000);
    expect((await households.getMine(t.db, B.ctx()))?.cushion_cents).toBe(0);
  });

  it('rejects a negative or fractional cushion, and a view-only member', async () => {
    await expect(households.setCushion(t.db, A.ctx(), -1)).rejects.toBeInstanceOf(InvalidInput);
    await expect(households.setCushion(t.db, A.ctx(), 0.5)).rejects.toBeInstanceOf(InvalidInput);
    await expect(households.setCushion(t.db, A.ctx('view'), 5)).rejects.toBeInstanceOf(Forbidden);
  });
});
