import { categories } from '@withinmeans/db';
import { DEFAULT_CATEGORIES, deletedCategoryMessage } from '@withinmeans/domain';
import { translated } from './errors.js';
import type { MemberContext } from './invitePartner.js';

type Ctx = Pick<MemberContext, 'db' | 'household'>;

export interface CategoryView {
  id: string;
  name: string;
  colorIndex: number;
  billCount: number;
}

/** Spec §3 step 4: active categories and how many recurring bills use each. */
export async function listCategories(ctx: Ctx): Promise<CategoryView[]> {
  const rows = await categories.listWithUsage(ctx.db, ctx.household);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    colorIndex: r.color_index,
    billCount: r.bill_count,
  }));
}

export const seedDefaultCategories = (ctx: Ctx) =>
  translated(() => categories.seedDefaults(ctx.db, ctx.household, DEFAULT_CATEGORIES));

export const createCategory = (ctx: Ctx, input: { name: string; colorIndex: number }) =>
  translated(async () => {
    const row = await categories.create(ctx.db, ctx.household, input);
    return { id: row.id };
  });

export const renameCategory = (ctx: Ctx, input: { id: string; name: string }) =>
  translated(() => categories.rename(ctx.db, ctx.household, input.id, input.name));

export const recolorCategory = (ctx: Ctx, input: { id: string; colorIndex: number }) =>
  translated(() => categories.setColor(ctx.db, ctx.household, input.id, input.colorIndex));

/**
 * The bills move to `moveToId`, or to the first remaining category (T18), and `message` says so.
 */
export const deleteCategory = (ctx: Ctx, input: { id: string; moveToId?: string | undefined }) =>
  translated(async () => {
    const moved = await categories.remove(ctx.db, ctx.household, input.id, input.moveToId);
    return {
      movedCount: moved.movedCount,
      movedToName: moved.movedToName,
      message: deletedCategoryMessage(moved.movedCount, moved.movedToName),
    };
  });
