import { sql } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Conflict, InvalidInput, NotFound } from '../context.js';
import { clearAll, seedHousehold, type Seeded } from '../testing/fixtures.js';
import { createTestDb, type TestDb } from '../testing/harness.js';
import { cardStatements, type NewStatement } from './cardStatements.js';
import { creditCards, type NewCreditCard } from './creditCards.js';

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

const NOW = new Date('2026-11-18T12:00:00Z');
const LATER = new Date('2026-11-19T12:00:00Z');

const newCard = (over: Partial<NewCreditCard> = {}): NewCreditCard => ({
  nickname: 'Travel card',
  dueDay: 26,
  usualPlan: 'full',
  ...over,
});

/** The seeded card has an October or November statement already; these use another month. */
const entry = (over: Partial<NewStatement> = {}): NewStatement => ({
  cardId: A.cardId,
  ym: '2026-12',
  statementCents: 147_160,
  minimumCents: 3_500,
  plannedPaymentCents: 128_417,
  ...over,
});

const saved = async (ym = '2026-12') =>
  (await cardStatements.listForMonths(t.db, A.ctx(), [ym]))[0];

const cardIds = async () => (await creditCards.list(t.db, A.ctx())).map((c) => c.id);

const closeMonth = (ym: string) =>
  t.db
    .insertInto('months')
    .values({
      household_id: A.householdId,
      ym,
      status: 'closed',
      started_at: NOW,
      closed_at: LATER,
    })
    .execute();

describe('P2-07 credit card schema', () => {
  it('No card number field exists anywhere', async () => {
    const { rows } = await sql<{ table_name: string; column_name: string }>`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = ${t.schema} AND table_name IN ('credit_cards', 'card_statements')
      ORDER BY table_name, column_name`.execute(t.db);
    const columns = (table: string) =>
      rows.filter((r) => r.table_name === table).map((r) => r.column_name);

    expect(columns('credit_cards')).toEqual([
      'archived_at',
      'created_at',
      'due_day',
      'household_id',
      'id',
      'nickname',
      'usual_plan',
    ]);
    expect(columns('card_statements')).toEqual([
      'card_id',
      'created_at',
      'household_id',
      'id',
      'minimum_cents',
      'paid_at',
      'paid_cents',
      'planned_payment_cents',
      'statement_cents',
      'ym',
    ]);
  });
});

describe('P2-07 credit cards repository', () => {
  it('adds a card with a trimmed nickname', async () => {
    const card = await creditCards.create(t.db, A.ctx(), newCard({ nickname: '  Travel card ' }));

    expect(card).toMatchObject({
      nickname: 'Travel card',
      due_day: 26,
      usual_plan: 'full',
      archived_at: null,
    });
    expect(await cardIds()).toContain(card.id);
  });

  it.each([
    { nickname: ' ' },
    { nickname: 'x'.repeat(41) },
    { nickname: '4111 1111 1111 1111' },
    { dueDay: 0 },
    { dueDay: 32 },
    { dueDay: 1.5 },
    { usualPlan: 'half' as never },
  ])('rejects %o', async (over) => {
    await expect(creditCards.create(t.db, A.ctx(), newCard(over))).rejects.toBeInstanceOf(
      InvalidInput,
    );
  });

  it('deletes a card with no statements', async () => {
    const card = await creditCards.create(t.db, A.ctx(), newCard());

    await creditCards.remove(t.db, A.ctx(), card.id, NOW);

    expect((await creditCards.list(t.db, A.ctx(), { includeArchived: true })).length).toBe(1);
  });

  it('archives a card with statements, keeping them', async () => {
    await creditCards.remove(t.db, A.ctx(), A.cardId, NOW);

    expect(await cardIds()).toEqual([]);
    const [kept] = await creditCards.list(t.db, A.ctx(), { includeArchived: true });
    expect(kept).toMatchObject({ id: A.cardId, archived_at: NOW });
    expect(await cardStatements.listForMonths(t.db, A.ctx(), [A.ym])).toHaveLength(1);
  });

  it("does not find another household's card", async () => {
    await expect(creditCards.remove(t.db, A.ctx(), B.cardId, NOW)).rejects.toBeInstanceOf(NotFound);
  });
});

describe('P2-07 card statements repository', () => {
  it('saves one statement per card per month, and an edit replaces it', async () => {
    await cardStatements.save(t.db, A.ctx(), entry(), NOW);
    await cardStatements.save(t.db, A.ctx(), entry({ statementCents: 150_000 }), NOW);

    expect(await cardStatements.listForMonths(t.db, A.ctx(), ['2026-12'])).toHaveLength(1);
    expect(await saved()).toMatchObject({
      statement_cents: 150_000,
      minimum_cents: 3_500,
      planned_payment_cents: 128_417,
      paid_cents: null,
      paid_at: null,
    });
  });

  it('records the planned amount when it is already paid', async () => {
    await cardStatements.save(t.db, A.ctx(), entry({ alreadyPaid: true }), NOW);

    expect(await saved()).toMatchObject({ paid_cents: 128_417, paid_at: NOW });
  });

  it('keeps what was paid when the statement is edited', async () => {
    await cardStatements.save(t.db, A.ctx(), entry(), NOW);
    await cardStatements.markPaid(t.db, A.ctx(), A.cardId, '2026-12', 100_000, NOW);

    await cardStatements.save(t.db, A.ctx(), entry({ alreadyPaid: true }), LATER);

    expect(await saved()).toMatchObject({ paid_cents: 100_000, paid_at: NOW });
  });

  it('lists the months asked for', async () => {
    await cardStatements.save(t.db, A.ctx(), entry(), NOW);

    const listed = await cardStatements.listForMonths(t.db, A.ctx(), [A.ym, '2026-12']);

    expect(listed.map((s) => s.ym).sort()).toEqual([A.ym, '2026-12']);
    await expect(cardStatements.listForMonths(t.db, A.ctx(), ['soon'])).rejects.toBeInstanceOf(
      InvalidInput,
    );
  });

  it.each([
    { plannedPaymentCents: 147_161 },
    { minimumCents: 147_161 },
    { statementCents: -1 },
    { minimumCents: 1.5 },
    { ym: '2026-13' },
  ])('rejects %o', async (over) => {
    await expect(cardStatements.save(t.db, A.ctx(), entry(over), NOW)).rejects.toBeInstanceOf(
      InvalidInput,
    );
  });

  it('takes no new statement for a removed card, but lets an old one be edited', async () => {
    await creditCards.remove(t.db, A.ctx(), A.cardId, NOW);

    await expect(cardStatements.save(t.db, A.ctx(), entry(), NOW)).rejects.toBeInstanceOf(
      InvalidInput,
    );
    await cardStatements.save(t.db, A.ctx(), entry({ ym: A.ym }), NOW);
    expect((await saved(A.ym))?.statement_cents).toBe(147_160);
  });

  it('marks a statement paid with the amount, and undoes it', async () => {
    await cardStatements.save(t.db, A.ctx(), entry(), NOW);

    await cardStatements.markPaid(t.db, A.ctx(), A.cardId, '2026-12', 128_417, NOW);
    expect(await saved()).toMatchObject({ paid_cents: 128_417, paid_at: NOW });

    await cardStatements.unmarkPaid(t.db, A.ctx(), A.cardId, '2026-12');
    expect(await saved()).toMatchObject({ paid_cents: null, paid_at: null });
  });

  it.each([-1, 1.5, 10_000_000_001])('rejects paying %s', async (cents) => {
    await expect(
      cardStatements.markPaid(t.db, A.ctx(), A.cardId, A.ym, cents, NOW),
    ).rejects.toBeInstanceOf(InvalidInput);
  });

  it('cannot pay a month with no statement', async () => {
    await expect(
      cardStatements.markPaid(t.db, A.ctx(), A.cardId, '2027-01', 1, NOW),
    ).rejects.toBeInstanceOf(NotFound);
    await expect(
      cardStatements.unmarkPaid(t.db, A.ctx(), A.cardId, '2027-01'),
    ).rejects.toBeInstanceOf(NotFound);
  });

  it.each([
    ['save', () => cardStatements.save(t.db, A.ctx(), entry(), NOW)],
    ['markPaid', () => cardStatements.markPaid(t.db, A.ctx(), A.cardId, '2026-12', 1, NOW)],
    ['unmarkPaid', () => cardStatements.unmarkPaid(t.db, A.ctx(), A.cardId, '2026-12')],
  ] as const)('a closed month is read-only: %s is rejected', async (_name, change) => {
    await closeMonth('2026-12');

    await expect(change()).rejects.toBeInstanceOf(Conflict);
  });
});
