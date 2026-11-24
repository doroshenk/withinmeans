import { describe, expect, it } from 'vitest';
import {
  CATEGORY_COLORS,
  DEFAULT_CATEGORIES,
  SUGGESTED_CATEGORIES,
  categoryNameError,
  createCategoryInput,
  deleteCategoryInput,
  deletedCategoryMessage,
  nextColorIndex,
  recolorCategoryInput,
  seedCategoriesInput,
  renameCategoryInput,
} from './categories';

const ID = '11111111-1111-4111-8111-111111111111';

describe('P1-11 category lists (spec §3 step 4)', () => {
  it('starts with the 7 default categories, in order', () => {
    expect(DEFAULT_CATEGORIES).toEqual([
      'Housing',
      'Utilities',
      'Home',
      'Insurance',
      'Savings',
      'Subscriptions',
      'Auto',
    ]);
  });

  it('offers the 7 one-tap suggestions', () => {
    expect(SUGGESTED_CATEGORIES).toEqual([
      'Medical',
      'Pets',
      'Kids',
      'Debt payments',
      'Charity',
      'Travel',
      'Groceries',
    ]);
  });

  it('has the 9 palette colors from the spec', () => {
    expect(CATEGORY_COLORS).toEqual([
      '#0F6E74',
      '#00929C',
      '#A87A00',
      '#6B57C9',
      '#2F5F62',
      '#C2417F',
      '#9C5B3B',
      '#C9610E',
      '#8A7D70',
    ]);
  });
});

describe('P1-11 tapping the swatch cycles the palette', () => {
  it('goes to the next color and wraps around after the last', () => {
    expect(nextColorIndex(0)).toBe(1);
    expect(nextColorIndex(7)).toBe(8);
    expect(nextColorIndex(8)).toBe(0);
  });
});

describe('P1-11 category names', () => {
  it('requires a name', () => {
    expect(categoryNameError('', [])).toBe('Give the category a name.');
    expect(categoryNameError('   ', [])).toBe('Give the category a name.');
  });

  it('rejects a duplicate, ignoring case and spaces around it', () => {
    expect(categoryNameError('home', ['Housing', 'Home'])).toBe(
      'You already have a category named "home".',
    );
    expect(categoryNameError('  HOME ', ['Home'])).toBe(
      'You already have a category named "HOME".',
    );
  });

  it('accepts a new name', () => {
    expect(categoryNameError('Pets', ['Home'])).toBeUndefined();
  });
});

describe('T18: deleting a category that bills use', () => {
  it('T18: says where the bills moved', () => {
    expect(deletedCategoryMessage(1, 'Housing')).toBe('Moved 1 bill to Housing.');
    expect(deletedCategoryMessage(3, 'Housing')).toBe('Moved 3 bills to Housing.');
  });

  it('says nothing when no bill used it', () => {
    expect(deletedCategoryMessage(0, 'Housing')).toBeNull();
  });
});

describe('P1-11 inputs', () => {
  it('create: trims the name, needs a color index 0..8', () => {
    expect(createCategoryInput.parse({ name: '  Pets ', colorIndex: 3 })).toEqual({
      name: 'Pets',
      colorIndex: 3,
    });
    expect(createCategoryInput.safeParse({ name: '  ', colorIndex: 3 }).success).toBe(false);
    expect(createCategoryInput.safeParse({ name: 'Pets', colorIndex: 9 }).success).toBe(false);
    expect(createCategoryInput.safeParse({ name: 'Pets', colorIndex: -1 }).success).toBe(false);
    expect(createCategoryInput.safeParse({ name: 'Pets', colorIndex: 1.5 }).success).toBe(false);
  });

  it('rename, recolor and delete need a UUID', () => {
    expect(renameCategoryInput.parse({ id: ID, name: ' Home ' })).toEqual({ id: ID, name: 'Home' });
    expect(renameCategoryInput.safeParse({ id: 'x', name: 'Home' }).success).toBe(false);
    expect(renameCategoryInput.safeParse({ id: ID, name: '' }).success).toBe(false);
    expect(recolorCategoryInput.parse({ id: ID, colorIndex: 8 })).toEqual({
      id: ID,
      colorIndex: 8,
    });
    expect(recolorCategoryInput.safeParse({ id: ID, colorIndex: 9 }).success).toBe(false);
    expect(deleteCategoryInput.parse({ id: ID })).toEqual({ id: ID });
    expect(deleteCategoryInput.safeParse({ id: 'x' }).success).toBe(false);
  });
});

describe('P1-11 seed input', () => {
  it('names the preset, so an empty call is rejected', () => {
    expect(seedCategoriesInput.parse({ preset: 'default' })).toEqual({ preset: 'default' });
    expect(seedCategoriesInput.safeParse({}).success).toBe(false);
    expect(seedCategoriesInput.safeParse({ preset: 'other' }).success).toBe(false);
  });
});
