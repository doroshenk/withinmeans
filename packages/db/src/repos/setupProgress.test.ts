import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Forbidden, InvalidInput } from '../context.js';
import { clearAll, seedHousehold, type Seeded } from '../testing/fixtures.js';
import { createTestDb, type TestDb } from '../testing/harness.js';
import { setupProgress } from './setupProgress.js';

let t: TestDb;
let A: Seeded;

beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.destroy();
});
beforeEach(async () => {
  await clearAll(t.db);
  A = await seedHousehold(t.db, 'A');
});

describe('P1-08 setupProgress', () => {
  it('lists saved steps in step order', async () => {
    await setupProgress.save(t.db, A.ctx(), 4, 'done');
    await setupProgress.save(t.db, A.ctx(), 3, 'skipped');
    const rows = await setupProgress.list(t.db, A.ctx());
    expect(rows.map((r) => [r.step, r.status])).toEqual([
      [1, 'done'],
      [3, 'skipped'],
      [4, 'done'],
    ]);
  });

  it('saving a step twice keeps one row and the latest status', async () => {
    await setupProgress.save(t.db, A.ctx(), 3, 'skipped');
    const again = await setupProgress.save(t.db, A.ctx(), 3, 'done');
    expect(again).toMatchObject({ step: 3, status: 'done' });
    const rows = await setupProgress.list(t.db, A.ctx());
    expect(rows.filter((r) => r.step === 3)).toHaveLength(1);
    expect(rows.find((r) => r.step === 3)?.status).toBe('done');
  });

  it('rejects a step outside 1..9', async () => {
    await expect(setupProgress.save(t.db, A.ctx(), 0, 'done')).rejects.toBeInstanceOf(InvalidInput);
    await expect(setupProgress.save(t.db, A.ctx(), 10, 'done')).rejects.toBeInstanceOf(
      InvalidInput,
    );
    await expect(setupProgress.save(t.db, A.ctx(), 2.5, 'done')).rejects.toBeInstanceOf(
      InvalidInput,
    );
  });

  it('a view-only member can list but not save', async () => {
    expect(await setupProgress.list(t.db, A.ctx('view'))).toHaveLength(1);
    await expect(setupProgress.save(t.db, A.ctx('view'), 4, 'done')).rejects.toBeInstanceOf(
      Forbidden,
    );
  });
});
