import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Conflict, Forbidden, InvalidInput } from '../context.js';
import { clearAll, seedHousehold, type Seeded } from '../testing/fixtures.js';
import { createTestDb, type TestDb } from '../testing/harness.js';
import { households } from './households.js';
import { months } from './months.js';
import { openMonth } from './openMonth.js';

let t: TestDb;
let A: Seeded;
let B: Seeded;

const NOW = new Date('2026-11-18T12:00:00Z');
const LATER = new Date('2026-11-19T12:00:00Z');

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
  // Start from a household with no month yet (seeding gives each one).
  await t.db.deleteFrom('months').where('household_id', '=', A.householdId).execute();
});

const yms = async (s: Seeded) => (await months.list(t.db, s.ctx())).map((m) => m.ym);

describe('P1-09 openMonth (spec §5.11)', () => {
  it('creates the Month row, open, with the start time', async () => {
    const result = await openMonth(t.db, A.ctx(), '2026-11', NOW);

    expect(result.created).toBe(true);
    expect(result.month).toMatchObject({ ym: '2026-11', status: 'open', closed_at: null });
    expect(result.month.started_at).toEqual(NOW);
  });

  it('is idempotent: calling it twice creates one Month and keeps the first start time', async () => {
    await openMonth(t.db, A.ctx(), '2026-11', NOW);
    const again = await openMonth(t.db, A.ctx(), '2026-11', LATER);

    expect(again.created).toBe(false);
    expect(again.month.started_at).toEqual(NOW);
    expect(await yms(A)).toEqual(['2026-11']);
  });

  it('two calls at the same moment (two tabs) leave one Month and no error', async () => {
    const results = await Promise.all([
      openMonth(t.db, A.ctx(), '2026-11', NOW),
      openMonth(t.db, A.ctx(), '2026-11', NOW),
    ]);

    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(await yms(A)).toEqual(['2026-11']);
  });

  it('does not touch another household, even for the same month', async () => {
    await openMonth(t.db, A.ctx(), '2026-10', NOW);

    expect(await yms(B)).toEqual(['2026-10']);
    expect((await months.get(t.db, B.ctx(), '2026-10'))?.started_at).not.toEqual(NOW);
  });

  it('rejects the view role and creates nothing', async () => {
    await expect(openMonth(t.db, A.ctx('view'), '2026-11', NOW)).rejects.toBeInstanceOf(Forbidden);
    expect(await yms(A)).toEqual([]);
  });

  it('rejects a malformed month', async () => {
    await expect(openMonth(t.db, A.ctx(), '2026-13', NOW)).rejects.toBeInstanceOf(InvalidInput);
  });
});

describe('P1-09 households.startFirstMonth (spec §3 step 1)', () => {
  const firstMonthOf = async (s: Seeded) => (await households.getMine(t.db, s.ctx()))?.first_month;

  it('sets first_month and opens that month together', async () => {
    const result = await households.startFirstMonth(t.db, A.ctx(), '2026-12', NOW);

    expect(result.created).toBe(true);
    expect(await firstMonthOf(A)).toBe('2026-12');
    expect(await yms(A)).toEqual(['2026-12']);
  });

  it('choosing the same month twice is fine and still one Month', async () => {
    await households.startFirstMonth(t.db, A.ctx(), '2026-11', NOW);
    const again = await households.startFirstMonth(t.db, A.ctx(), '2026-11', LATER);

    expect(again.created).toBe(false);
    expect(await firstMonthOf(A)).toBe('2026-11');
    expect(await yms(A)).toEqual(['2026-11']);
  });

  it('a different month once one is open is a Conflict and changes nothing', async () => {
    await households.startFirstMonth(t.db, A.ctx(), '2026-11', NOW);

    await expect(
      households.startFirstMonth(t.db, A.ctx(), '2026-12', LATER),
    ).rejects.toBeInstanceOf(Conflict);
    expect(await firstMonthOf(A)).toBe('2026-11');
    expect(await yms(A)).toEqual(['2026-11']);
  });

  it("leaves the other household's first month alone", async () => {
    const before = await firstMonthOf(B);
    await households.startFirstMonth(t.db, A.ctx(), '2026-12', NOW);

    expect(await firstMonthOf(B)).toBe(before);
    expect(await yms(B)).toEqual(['2026-10']);
  });

  it('rejects the view role and changes nothing', async () => {
    const before = await firstMonthOf(A);
    await expect(
      households.startFirstMonth(t.db, A.ctx('view'), '2026-12', NOW),
    ).rejects.toBeInstanceOf(Forbidden);

    expect(await firstMonthOf(A)).toBe(before);
    expect(await yms(A)).toEqual([]);
  });
});
