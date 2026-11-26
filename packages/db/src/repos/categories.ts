import type { Selectable } from 'kysely';
import {
  assertCanWrite,
  Conflict,
  InvalidInput,
  NotFound,
  type HouseholdContext,
} from '../context.js';
import type { CategoriesTable, Database } from '../db.js';
import { cleanName, inTransaction, mustHaveChanged, orConflict } from './shared.js';

export type Category = Selectable<CategoriesTable>;
export type CategoryWithUsage = Category & { bill_count: number };
export interface RemovedCategory {
  movedCount: number;
  movedToId: string;
  movedToName: string;
}

/** The unique key: names match ignoring case (the name is already trimmed). */
const keyOf = (name: string): string => name.toLowerCase();

export const categories = {
  async list(
    db: Database,
    ctx: HouseholdContext,
    options: { includeArchived?: boolean } = {},
  ): Promise<Category[]> {
    let query = db.selectFrom('categories').selectAll().where('household_id', '=', ctx.householdId);
    if (options.includeArchived !== true) query = query.where('archived_at', 'is', null);
    return query.orderBy('sort').orderBy('name_key').execute();
  },

  async create(
    db: Database,
    ctx: HouseholdContext,
    input: { name: string; colorIndex: number },
  ): Promise<Category> {
    assertCanWrite(ctx);
    const name = cleanName(input.name);
    return orConflict(
      () =>
        inTransaction(db, async (trx) => {
          const last = await trx
            .selectFrom('categories')
            .select((eb) => eb.fn.max('sort').as('last'))
            .where('household_id', '=', ctx.householdId)
            .executeTakeFirst();
          return trx
            .insertInto('categories')
            .values({
              household_id: ctx.householdId,
              name,
              name_key: keyOf(name),
              color_index: input.colorIndex,
              sort: (last?.last ?? -1) + 1,
              archived_at: null,
            })
            .returningAll()
            .executeTakeFirstOrThrow();
        }),
      `A category named "${name}" already exists`,
    );
  },

  async rename(db: Database, ctx: HouseholdContext, id: string, name: string): Promise<void> {
    assertCanWrite(ctx);
    const clean = cleanName(name);
    const result = await orConflict(
      () =>
        db
          .updateTable('categories')
          .set({ name: clean, name_key: keyOf(clean) })
          .where('id', '=', id)
          .where('household_id', '=', ctx.householdId)
          .executeTakeFirst(),
      `A category named "${clean}" already exists`,
    );
    mustHaveChanged(result.numUpdatedRows, 'Category');
  },

  async setColor(
    db: Database,
    ctx: HouseholdContext,
    id: string,
    colorIndex: number,
  ): Promise<void> {
    assertCanWrite(ctx);
    const result = await db
      .updateTable('categories')
      .set({ color_index: colorIndex })
      .where('id', '=', id)
      .where('household_id', '=', ctx.householdId)
      .executeTakeFirst();
    mustHaveChanged(result.numUpdatedRows, 'Category');
  },

  /** `ids` in the new order; every id must belong to the household. */
  async reorder(db: Database, ctx: HouseholdContext, ids: string[]): Promise<void> {
    assertCanWrite(ctx);
    if (ids.length === 0) return;
    await inTransaction(db, async (trx) => {
      const mine = await trx
        .selectFrom('categories')
        .select('id')
        .where('household_id', '=', ctx.householdId)
        .where('id', 'in', ids)
        .execute();
      if (mine.length !== new Set(ids).size) throw new NotFound('Category not found');
      for (const [index, id] of ids.entries()) {
        await trx
          .updateTable('categories')
          .set({ sort: index })
          .where('id', '=', id)
          .where('household_id', '=', ctx.householdId)
          .execute();
      }
    });
  },

  async archive(db: Database, ctx: HouseholdContext, id: string): Promise<void> {
    assertCanWrite(ctx);
    const result = await db
      .updateTable('categories')
      .set({ archived_at: new Date() })
      .where('id', '=', id)
      .where('household_id', '=', ctx.householdId)
      .executeTakeFirst();
    mustHaveChanged(result.numUpdatedRows, 'Category');
  },

  /** Only when the household has no categories at all: creates `defaults` in order. */
  async seedDefaults(
    db: Database,
    ctx: HouseholdContext,
    defaults: readonly string[],
  ): Promise<void> {
    assertCanWrite(ctx);
    const names = defaults.map(cleanName);
    try {
      await orConflict(
        () =>
          inTransaction(db, async (trx) => {
            const existing = await trx
              .selectFrom('categories')
              .select('id')
              .where('household_id', '=', ctx.householdId)
              .limit(1)
              .executeTakeFirst();
            if (existing !== undefined || names.length === 0) return;
            await trx
              .insertInto('categories')
              .values(
                names.map((name, index) => ({
                  household_id: ctx.householdId,
                  name,
                  name_key: keyOf(name),
                  color_index: index % 9,
                  sort: index,
                  archived_at: null,
                })),
              )
              .execute();
          }),
        'Categories already exist',
      );
    } catch (err) {
      // Two tabs seeding at once: the loser hits the unique name, and the winner's rows are there.
      if (!(err instanceof Conflict)) throw err;
    }
  },

  /** Active categories with how many recurring bills (not ended ones) use each. */
  async listWithUsage(db: Database, ctx: HouseholdContext): Promise<CategoryWithUsage[]> {
    const rows = await db
      .selectFrom('categories')
      .selectAll('categories')
      .select((eb) =>
        eb
          .selectFrom('recurring_bills')
          .select((e) => e.fn.countAll<string>().as('n'))
          .whereRef('recurring_bills.category_id', '=', 'categories.id')
          .where('recurring_bills.household_id', '=', ctx.householdId)
          .where('recurring_bills.end_ym', 'is', null)
          .as('bill_count'),
      )
      .where('categories.household_id', '=', ctx.householdId)
      .where('categories.archived_at', 'is', null)
      .orderBy('categories.sort')
      .orderBy('categories.name_key')
      .execute();
    return rows.map((r) => ({ ...r, bill_count: Number(r.bill_count) }));
  },

  /** Ids of the categories any bill uses: recurring (ended ones too) or a month's bill. */
  async usedIds(db: Database, ctx: HouseholdContext): Promise<string[]> {
    const rows = await db
      .selectFrom('recurring_bills')
      .select('category_id')
      .where('household_id', '=', ctx.householdId)
      .union(
        db.selectFrom('bills').select('category_id').where('household_id', '=', ctx.householdId),
      )
      .execute();
    return rows.map((r) => r.category_id);
  },

  /**
   * Deletes a category; its recurring bills and month Bills move to `moveToId` (spec §4), or
   * without one to the first remaining category (spec §3 step 4, T18). Never the last one. Ended bills move too, for their history, but
   * `movedCount` counts only recurring bills that have not ended, plus one-time bills.
   */
  async remove(
    db: Database,
    ctx: HouseholdContext,
    id: string,
    moveToId?: string,
  ): Promise<RemovedCategory> {
    assertCanWrite(ctx);
    if (moveToId === id) throw new InvalidInput('Choose a different category for its bills');
    return inTransaction(db, async (trx) => {
      const mine = await trx
        .selectFrom('categories')
        .select('id')
        .where('id', '=', id)
        .where('household_id', '=', ctx.householdId)
        .executeTakeFirst();
      if (mine === undefined) throw new NotFound('Category not found');
      let others = trx
        .selectFrom('categories')
        .select(['id', 'name'])
        .where('household_id', '=', ctx.householdId)
        .where('archived_at', 'is', null)
        .where('id', '<>', id)
        .orderBy('sort')
        .orderBy('name_key');
      if (moveToId !== undefined) others = others.where('id', '=', moveToId);
      const target = await others.executeTakeFirst();
      if (target === undefined) {
        if (moveToId !== undefined) throw new NotFound('Category not found');
        throw new Conflict('At least one category is required');
      }
      const active = await trx
        .selectFrom('recurring_bills')
        .select('id')
        .where('household_id', '=', ctx.householdId)
        .where('category_id', '=', id)
        .where('end_ym', 'is', null)
        .execute();
      await trx
        .updateTable('recurring_bills')
        .set({ category_id: target.id })
        .where('household_id', '=', ctx.householdId)
        .where('category_id', '=', id)
        .execute();
      // One-time bills first, to count them; then the rows made from recurring bills.
      const oneTime = await trx
        .updateTable('bills')
        .set({ category_id: target.id })
        .where('household_id', '=', ctx.householdId)
        .where('category_id', '=', id)
        .where('recurring_bill_id', 'is', null)
        .executeTakeFirst();
      await trx
        .updateTable('bills')
        .set({ category_id: target.id })
        .where('household_id', '=', ctx.householdId)
        .where('category_id', '=', id)
        .execute();
      await trx
        .deleteFrom('categories')
        .where('id', '=', id)
        .where('household_id', '=', ctx.householdId)
        .execute();
      return {
        movedCount: active.length + Number(oneTime.numUpdatedRows),
        movedToId: target.id,
        movedToName: target.name,
      };
    });
  },
};
