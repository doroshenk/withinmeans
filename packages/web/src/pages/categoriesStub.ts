import type { CategoriesClient } from './CategoriesStep';

/** Test helper: the category calls of a client, for tests that are not about categories. */
export const categoriesStub: CategoriesClient = {
  categories: {
    query: () => Promise.resolve([{ id: 'c1', name: 'Housing', colorIndex: 0, billCount: 0 }]),
  },
  seedDefaultCategories: { mutate: () => Promise.resolve({}) },
  createCategory: { mutate: () => Promise.resolve({ id: 'c2' }) },
  renameCategory: { mutate: () => Promise.resolve({}) },
  recolorCategory: { mutate: () => Promise.resolve({}) },
  deleteCategory: {
    mutate: () => Promise.resolve({ movedCount: 0, movedToName: '', message: null }),
  },
};
