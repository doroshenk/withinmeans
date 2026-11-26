import type { RecurringClient } from './RecurringPage';
import type { RecurringBillsClient } from './RecurringBillsStep';

/** Test helper: the recurring-bill calls of a client, for tests that are not about bills. */
export const recurringBillsStub: Pick<
  RecurringBillsClient,
  'setupBills' | 'addRecurringBill' | 'removeRecurringBill'
> &
  Pick<
    RecurringClient,
    'recurringBills' | 'updateRecurringBill' | 'endRecurringBill' | 'restartRecurringBill'
  > = {
  recurringBills: {
    query: () =>
      Promise.resolve({
        today: '2026-11-18',
        bills: [],
        usedCategoryIds: [],
        takeHomeCents: null,
      }),
  },
  updateRecurringBill: { mutate: () => Promise.resolve({}) },
  endRecurringBill: { mutate: () => Promise.resolve({}) },
  restartRecurringBill: { mutate: () => Promise.resolve({}) },
  setupBills: { query: () => Promise.resolve({ bills: [], totalCents: 0, takeHomeCents: null }) },
  addRecurringBill: { mutate: () => Promise.resolve({ id: 'b1' }) },
  removeRecurringBill: { mutate: () => Promise.resolve({}) },
};
