import type { Selectable } from 'kysely';
import type { HouseholdContext } from '../context.js';
import type { CategoriesTable, Database } from '../db.js';
import { notImplemented } from './notImplemented.js';

export type Category = Selectable<CategoriesTable>;

export const categories = {
  list(
    _db: Database,
    _ctx: HouseholdContext,
    _options?: { includeArchived?: boolean },
  ): Promise<Category[]> {
    return notImplemented();
  },
  create(
    _db: Database,
    _ctx: HouseholdContext,
    _input: { name: string; colorIndex: number },
  ): Promise<Category> {
    return notImplemented();
  },
  rename(_db: Database, _ctx: HouseholdContext, _id: string, _name: string): Promise<void> {
    return notImplemented();
  },
  setColor(_db: Database, _ctx: HouseholdContext, _id: string, _colorIndex: number): Promise<void> {
    return notImplemented();
  },
  /** `ids` in the new order; every id must belong to the household. */
  reorder(_db: Database, _ctx: HouseholdContext, _ids: string[]): Promise<void> {
    return notImplemented();
  },
  archive(_db: Database, _ctx: HouseholdContext, _id: string): Promise<void> {
    return notImplemented();
  },
};
