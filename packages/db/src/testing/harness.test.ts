import { afterAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from './harness.js';

const made: TestDb[] = [];
afterAll(async () => {
  await Promise.all(made.map((t) => t.destroy()));
});

describe('test harness', () => {
  it('gives every caller its own migrated schema', async () => {
    const a = await createTestDb();
    const b = await createTestDb();
    made.push(a, b);
    expect(a.schema).not.toBe(b.schema);
    await a.db
      .insertInto('households')
      .values({
        id: '11111111-1111-4111-8111-111111111111',
        name: 'x',
        mode: 'solo',
        timezone: 'UTC',
        cushion_cents: 0,
        first_month: '2026-11',
      })
      .execute();
    expect(await b.db.selectFrom('households').selectAll().execute()).toEqual([]);
  });
});
