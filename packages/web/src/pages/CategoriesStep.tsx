export interface CategoryRow {
  id: string;
  name: string;
  colorIndex: number;
  billCount: number;
}

export interface DeleteResult {
  movedCount: number;
  movedToName: string;
  message: string | null;
}

export interface CategoriesClient {
  categories: { query: () => Promise<CategoryRow[]> };
  seedDefaultCategories: { mutate: (input: { preset: 'default' }) => Promise<unknown> };
  createCategory: {
    mutate: (input: { name: string; colorIndex: number }) => Promise<{ id: string }>;
  };
  renameCategory: { mutate: (input: { id: string; name: string }) => Promise<unknown> };
  recolorCategory: { mutate: (input: { id: string; colorIndex: number }) => Promise<unknown> };
  deleteCategory: { mutate: (input: { id: string }) => Promise<DeleteResult> };
}

/** Spec §3 step 4: bill categories. Stub until the green step. */
export function CategoriesStep(_props: { client: CategoriesClient }) {
  return <p>Coming soon</p>;
}
