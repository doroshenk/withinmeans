import type { CategoriesClient } from './CategoriesStep';

export interface BillRow {
  id: string;
  name: string;
  estimateCents: number;
  dueDay: number;
  categoryId: string;
  categoryName: string;
  autopay: boolean;
}

export interface SetupBillsData {
  bills: BillRow[];
  totalCents: number;
  takeHomeCents: number | null;
}

export interface RecurringBillsClient extends Pick<CategoriesClient, 'categories'> {
  setupBills: { query: () => Promise<SetupBillsData> };
  addRecurringBill: {
    mutate: (input: {
      name: string;
      estimateCents: number;
      dueDay: number;
      categoryId: string;
      autopay: boolean;
    }) => Promise<{ id: string }>;
  };
  removeRecurringBill: { mutate: (input: { id: string }) => Promise<unknown> };
}

export function RecurringBillsStep(_props: { client: RecurringBillsClient }) {
  return null;
}
