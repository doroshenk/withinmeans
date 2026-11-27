import type { BillsPageClient } from './bills/types';

const done = () => Promise.resolve({});

/** Test helper: the Bills page's calls, for tests that are not about them. */
export const billsPageStub: BillsPageClient = {
  billsPage: {
    query: () =>
      Promise.resolve({
        today: '2026-11-18',
        ym: '2026-11',
        status: 'open',
        canOpen: false,
        bills: [],
        categories: [],
        paychecks: [],
        otherIncome: [],
      }),
  },
  openMonth: { mutate: done },
  addBill: { mutate: done },
  updateBill: { mutate: done },
  setBillPaid: { mutate: done },
  removeBill: { mutate: done },
};
