import { z } from 'zod';

export const CATEGORY_COLORS: readonly string[] = [];
export const DEFAULT_CATEGORIES: readonly string[] = [];
export const SUGGESTED_CATEGORIES: readonly string[] = [];

export function nextColorIndex(_current: number): number {
  throw new Error('not implemented');
}

export function categoryNameError(
  _name: string,
  _otherNames: readonly string[],
): string | undefined {
  throw new Error('not implemented');
}

export function deletedCategoryMessage(_movedCount: number, _toName: string): string | null {
  throw new Error('not implemented');
}

export const seedCategoriesInput = z.object({});
export const createCategoryInput = z.object({});
export const renameCategoryInput = z.object({});
export const recolorCategoryInput = z.object({});
export const deleteCategoryInput = z.object({});
