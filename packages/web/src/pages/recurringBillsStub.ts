import type { RecurringBillsClient } from './RecurringBillsStep';

/** Test helper: the recurring-bill calls of a client, for tests that are not about bills. */
export const recurringBillsStub: Pick<
  RecurringBillsClient,
  'setupBills' | 'addRecurringBill' | 'removeRecurringBill'
> = {
  setupBills: { query: () => Promise.resolve({ bills: [], totalCents: 0, takeHomeCents: null }) },
  addRecurringBill: { mutate: () => Promise.resolve({ id: 'b1' }) },
  removeRecurringBill: { mutate: () => Promise.resolve({}) },
};
