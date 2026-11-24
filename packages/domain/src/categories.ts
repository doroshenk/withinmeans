import { z } from 'zod';

/** Spec §7 category colors, in order. A category stores its index into this list. */
export const CATEGORY_COLORS: readonly string[] = [
  '#0F6E74',
  '#00929C',
  '#A87A00',
  '#6B57C9',
  '#2F5F62',
  '#C2417F',
  '#9C5B3B',
  '#C9610E',
  '#8A7D70',
];

/** Spec §3 step 4: the categories every household starts with. */
export const DEFAULT_CATEGORIES: readonly string[] = [
  'Housing',
  'Utilities',
  'Home',
  'Insurance',
  'Savings',
  'Subscriptions',
  'Auto',
];

/** Spec §3 step 4: one-tap additions. */
export const SUGGESTED_CATEGORIES: readonly string[] = [
  'Medical',
  'Pets',
  'Kids',
  'Debt payments',
  'Charity',
  'Travel',
  'Groceries',
];

const LAST_COLOR = CATEGORY_COLORS.length - 1;

/** Tapping the swatch: the next palette color, wrapping to the first after the last. */
export function nextColorIndex(current: number): number {
  return current >= LAST_COLOR ? 0 : current + 1;
}

/**
 * Spec §3 step 4: a name is required and unique, and case does not make a difference.
 * `otherNames` are the other categories' names (leave out the one being renamed).
 */
export function categoryNameError(name: string, otherNames: readonly string[]): string | undefined {
  const trimmed = name.trim();
  if (trimmed === '') return 'Give the category a name.';
  const key = trimmed.toLowerCase();
  if (otherNames.some((other) => other.trim().toLowerCase() === key)) {
    return `You already have a category named "${trimmed}".`;
  }
  return undefined;
}

/** Spec §3 step 4 / T18: tells the user where the bills went, or nothing when none moved. */
export function deletedCategoryMessage(movedCount: number, toName: string): string | null {
  if (movedCount === 0) return null;
  return `Moved ${movedCount} ${movedCount === 1 ? 'bill' : 'bills'} to ${toName}.`;
}

const name = z.string().trim().min(1);
const id = z.uuid();
const colorIndex = z.number().int().min(0).max(LAST_COLOR);

export const seedCategoriesInput = z.object({ preset: z.literal('default') });
export const createCategoryInput = z.object({ name, colorIndex });
export const renameCategoryInput = z.object({ id, name });
export const recolorCategoryInput = z.object({ id, colorIndex });
export const deleteCategoryInput = z.object({ id });
