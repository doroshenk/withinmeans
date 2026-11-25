import type { RecurringBillItem } from '@withinmeans/domain';
import type { CategoriesClient } from './CategoriesStep';
import type { RecurringBillsClient } from './RecurringBillsStep';

export interface RecurringData {
  /** "YYYY-MM-DD" in the household's time zone. */
  today: string;
  bills: RecurringBillItem[];
  /** Categories that any bill, past ones too, uses: deleting one asks where they move. */
  usedCategoryIds: string[];
  /** Monthly take-home pay; null until pay schedules exist. */
  takeHomeCents: number | null;
}

export interface BillInput {
  name: string;
  estimateCents: number;
  dueDay: number;
  categoryId: string;
  autopay: boolean;
}

type ById = { mutate: (input: { id: string }) => Promise<unknown> };

export interface RecurringClient
  extends
    Pick<
      CategoriesClient,
      'categories' | 'createCategory' | 'renameCategory' | 'recolorCategory' | 'deleteCategory'
    >,
    Pick<RecurringBillsClient, 'addRecurringBill' | 'removeRecurringBill'> {
  recurringBills: { query: () => Promise<RecurringData> };
  updateRecurringBill: { mutate: (input: BillInput & { id: string }) => Promise<unknown> };
  endRecurringBill: ById;
  restartRecurringBill: ById;
}

/** Spec §6.3. */
export function RecurringPage(_props: { client: RecurringClient }): never {
  throw new Error('not implemented');
}
