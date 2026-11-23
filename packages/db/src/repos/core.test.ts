import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Conflict, InvalidInput } from '../context.js';
import { clearAll, seedHousehold, type Seeded } from '../testing/fixtures.js';
import { createTestDb, type TestDb } from '../testing/harness.js';
import { accounts } from './accounts.js';
import { balanceSnapshots } from './balanceSnapshots.js';
import { categories } from './categories.js';
import { invites } from './invites.js';
import { memberships } from './memberships.js';
import { months } from './months.js';
import { recurringBills } from './recurringBills.js';

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

describe('P1-01 categories', () => {
  it('P1-01: category names are unique per household ignoring case', async () => {
    await categories.create(t.db, A.ctx(), { name: 'Rent', colorIndex: 1 });
    await expect(
      categories.create(t.db, A.ctx(), { name: 'RENT', colorIndex: 2 }),
    ).rejects.toBeInstanceOf(Conflict);
    await expect(
      categories.create(t.db, A.ctx(), { name: '  rent ', colorIndex: 2 }),
    ).rejects.toBeInstanceOf(Conflict);
  });

  it('P1-01: the same category name is fine in another household', async () => {
    await categories.create(t.db, A.ctx(), { name: 'Rent', colorIndex: 1 });
    const other = await categories.create(t.db, B.ctx(), { name: 'Rent', colorIndex: 1 });
    expect(other.name).toBe('Rent');
  });

  it('P1-01: renaming onto another category name, ignoring case, is a conflict', async () => {
    await categories.create(t.db, A.ctx(), { name: 'Rent', colorIndex: 1 });
    const food = await categories.create(t.db, A.ctx(), { name: 'Food', colorIndex: 2 });
    await expect(categories.rename(t.db, A.ctx(), food.id, 'rENT')).rejects.toBeInstanceOf(
      Conflict,
    );
  });

  it('P1-01: a category can change the case of its own name', async () => {
    const food = await categories.create(t.db, A.ctx(), { name: 'food', colorIndex: 2 });
    await categories.rename(t.db, A.ctx(), food.id, 'Food');
    const names = (await categories.list(t.db, A.ctx())).map((c) => c.name);
    expect(names).toContain('Food');
    expect(names).not.toContain('food');
  });

  it('P1-01: the database itself refuses two names that match ignoring case', async () => {
    await categories.create(t.db, A.ctx(), { name: 'Rent', colorIndex: 1 });
    await expect(
      t.db
        .insertInto('categories')
        .values({
          household_id: A.householdId,
          name: 'RENT',
          name_key: 'rent',
          archived_at: null,
        })
        .execute(),
    ).rejects.toThrow();
  });

  it('P1-01: an empty category name is invalid input', async () => {
    await expect(
      categories.create(t.db, A.ctx(), { name: '   ', colorIndex: 1 }),
    ).rejects.toBeInstanceOf(InvalidInput);
  });

  it('P1-01: new categories go to the end, in order, and archived ones are hidden by default', async () => {
    const first = await categories.create(t.db, A.ctx(), { name: 'First', colorIndex: 1 });
    const second = await categories.create(t.db, A.ctx(), { name: 'Second', colorIndex: 2 });
    expect(second.sort).toBeGreaterThan(first.sort);
    await categories.archive(t.db, A.ctx(), first.id);
    const visible = (await categories.list(t.db, A.ctx())).map((c) => c.name);
    expect(visible).toContain('Second');
    expect(visible).not.toContain('First');
    const all = (await categories.list(t.db, A.ctx(), { includeArchived: true })).map(
      (c) => c.name,
    );
    expect(all).toContain('First');
  });

  it('P1-01: reorder puts categories in the given order', async () => {
    const x = await categories.create(t.db, A.ctx(), { name: 'X', colorIndex: 1 });
    const y = await categories.create(t.db, A.ctx(), { name: 'Y', colorIndex: 2 });
    await categories.reorder(t.db, A.ctx(), [y.id, x.id, A.categoryId]);
    expect((await categories.list(t.db, A.ctx())).map((c) => c.name)).toEqual([
      'Y',
      'X',
      'A-secret category',
    ]);
  });
});

describe('P1-01 accounts and balances', () => {
  it('P1-01: setting a primary checking account leaves exactly one', async () => {
    const one = await accounts.create(t.db, A.ctx(), { name: 'One', type: 'checking' });
    const two = await accounts.create(t.db, A.ctx(), { name: 'Two', type: 'checking' });
    await accounts.setPrimaryChecking(t.db, A.ctx(), one.id);
    await accounts.setPrimaryChecking(t.db, A.ctx(), two.id);
    const primary = (await accounts.list(t.db, A.ctx())).filter((a) => a.is_primary_checking);
    expect(primary.map((a) => a.name)).toEqual(['Two']);
  });

  it("P1-01: another household's primary account is untouched", async () => {
    await accounts.setPrimaryChecking(t.db, B.ctx(), B.accountId);
    await accounts.setPrimaryChecking(t.db, A.ctx(), A.accountId);
    const b = await accounts.list(t.db, B.ctx());
    expect(b.filter((a) => a.is_primary_checking)).toHaveLength(1);
  });

  it('P1-01: only a checking account can be primary', async () => {
    const savings = await accounts.create(t.db, A.ctx(), { name: 'Sav', type: 'savings' });
    await expect(accounts.setPrimaryChecking(t.db, A.ctx(), savings.id)).rejects.toBeInstanceOf(
      InvalidInput,
    );
  });

  it('P1-01: archived accounts are hidden unless asked for', async () => {
    await accounts.archive(t.db, A.ctx(), A.accountId);
    expect(await accounts.list(t.db, A.ctx())).toEqual([]);
    expect(await accounts.list(t.db, A.ctx(), { includeArchived: true })).toHaveLength(1);
  });

  it('P1-01: the latest balance is the one with the newest date, whatever order they were added', async () => {
    const add = (date: string, balanceCents: number) =>
      balanceSnapshots.add(t.db, A.ctx(), { accountId: A.accountId, date, balanceCents, note: '' });
    await add('2026-11-18', 250_000);
    await add('2026-11-02', 900_000);
    expect((await balanceSnapshots.latest(t.db, A.ctx(), A.accountId))?.balance_cents).toBe(
      250_000,
    );
    const dates = (await balanceSnapshots.listForAccount(t.db, A.ctx(), A.accountId)).map(
      (s) => s.date,
    );
    expect(dates).toEqual(['2026-11-18', '2026-11-05', '2026-11-02']);
  });

  it('P1-01: a household with no snapshots has no latest balance', async () => {
    const fresh = await accounts.create(t.db, A.ctx(), { name: 'New', type: 'cash' });
    expect(await balanceSnapshots.latest(t.db, A.ctx(), fresh.id)).toBeUndefined();
  });
});

describe('P1-01 recurring bills', () => {
  const input = (over: Partial<Parameters<typeof recurringBills.create>[2]> = {}) => ({
    name: 'Rent',
    estimateCents: 120_000,
    dueDay: 1,
    categoryId: A.categoryId,
    autopay: false,
    startYm: '2026-11',
    ...over,
  });

  it('P1-01: creates a bill with an optional account', async () => {
    const bill = await recurringBills.create(t.db, A.ctx(), input());
    expect(bill.account_id).toBeNull();
    expect(bill.end_ym).toBeNull();
    expect(bill.estimate_cents).toBe(120_000);
  });

  it.each([0, 29, 1.5])('P1-01: due day %s is invalid input', async (dueDay) => {
    await expect(recurringBills.create(t.db, A.ctx(), input({ dueDay }))).rejects.toBeInstanceOf(
      InvalidInput,
    );
  });

  it.each(['2026-13', '2026-1', 'Nov 2026'])(
    'P1-01: start month %s is invalid input',
    async (startYm) => {
      await expect(recurringBills.create(t.db, A.ctx(), input({ startYm }))).rejects.toBeInstanceOf(
        InvalidInput,
      );
    },
  );

  it('P1-01: an end month before the start month is invalid input', async () => {
    await expect(
      recurringBills.create(t.db, A.ctx(), input({ endYm: '2026-10' })),
    ).rejects.toBeInstanceOf(InvalidInput);
    await expect(
      recurringBills.end(t.db, A.ctx(), A.recurringBillId, '2026-09'),
    ).rejects.toBeInstanceOf(InvalidInput);
  });

  it('P1-01: money is whole cents', async () => {
    await expect(
      recurringBills.create(t.db, A.ctx(), input({ estimateCents: 10.5 })),
    ).rejects.toBeInstanceOf(InvalidInput);
  });

  it('P1-01: ending a bill keeps the row', async () => {
    await recurringBills.end(t.db, A.ctx(), A.recurringBillId, '2027-01');
    const bill = (await recurringBills.list(t.db, A.ctx())).find((b) => b.id === A.recurringBillId);
    expect(bill?.end_ym).toBe('2027-01');
  });

  it('P1-01: update changes only the fields given', async () => {
    await recurringBills.update(t.db, A.ctx(), A.recurringBillId, { estimateCents: 51_000 });
    const bill = (await recurringBills.list(t.db, A.ctx()))[0];
    expect(bill?.estimate_cents).toBe(51_000);
    expect(bill?.name).toBe('A-secret bill');
  });
});

describe('P1-01 invites', () => {
  it('P1-01: an invite records who sent it and starts pending', async () => {
    const invite = await invites.create(t.db, A.ctx(), {
      name: 'Pat',
      email: 'pat@example.test',
      role: 'full',
      note: 'hi',
      token: 'tok-1',
      expiresAt: new Date('2026-11-25T00:00:00Z'),
    });
    expect(invite.invited_by).toBe(A.userId);
    expect(invite.household_id).toBe(A.householdId);
    expect(invite.accepted_at).toBeNull();
  });

  it('P1-01: accepted invites are not pending, revoked invites are gone', async () => {
    await t.db
      .updateTable('invites')
      .set({ accepted_at: new Date('2026-11-20T00:00:00Z') })
      .where('id', '=', A.inviteId)
      .execute();
    expect(await invites.listPending(t.db, A.ctx())).toEqual([]);
    await invites.revoke(t.db, A.ctx(), A.inviteId);
    expect(await invites.findByToken(t.db, A.inviteToken)).toBeUndefined();
  });

  it('P1-01: findByToken finds only the invite with that exact token', async () => {
    expect((await invites.findByToken(t.db, B.inviteToken))?.household_id).toBe(B.householdId);
    expect(await invites.findByToken(t.db, 'nope')).toBeUndefined();
  });

  it('P1-01: the view role cannot create an invite, and the token is unique', async () => {
    await expect(
      invites.create(t.db, A.ctx(), {
        name: 'Dup',
        email: 'dup@example.test',
        role: 'view',
        note: '',
        token: A.inviteToken,
        expiresAt: new Date('2026-11-25T00:00:00Z'),
      }),
    ).rejects.toBeInstanceOf(Conflict);
  });
});

describe('P1-01 months and memberships', () => {
  it('P1-01: a month is inserted open, with no close time', async () => {
    const month = await months.insert(t.db, A.ctx(), '2026-12', new Date('2026-12-01T12:00:00Z'));
    expect(month.status).toBe('open');
    expect(month.closed_at).toBeNull();
    expect((await months.get(t.db, A.ctx(), '2026-12'))?.ym).toBe('2026-12');
  });

  it('P1-01: the same month cannot be inserted twice, but two households can each have it', async () => {
    await months.insert(t.db, A.ctx(), '2026-12', new Date());
    await expect(months.insert(t.db, A.ctx(), '2026-12', new Date())).rejects.toBeInstanceOf(
      Conflict,
    );
    await expect(months.insert(t.db, B.ctx(), '2026-12', new Date())).resolves.toBeDefined();
  });

  it('P1-01: a bad month string is invalid input', async () => {
    await expect(months.insert(t.db, A.ctx(), '2026-13', new Date())).rejects.toBeInstanceOf(
      InvalidInput,
    );
  });

  it('P1-01: members lists name, email and role for this household only', async () => {
    expect(await memberships.list(t.db, A.ctx())).toEqual([
      { userId: A.userId, name: 'A-secret user', email: 'a@example.test', role: 'owner' },
    ]);
  });
});
