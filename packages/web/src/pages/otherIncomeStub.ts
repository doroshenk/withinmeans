import type { OtherIncomeClient } from './PaychecksPage';

/** Test helper: the one-time income calls of a client, for tests that are not about income. */
export const otherIncomeStub: OtherIncomeClient = {
  otherIncome: {
    query: () =>
      Promise.resolve({
        today: '2026-11-18',
        ym: '2026-11',
        entries: [],
        recent: [],
        accounts: [],
      }),
  },
  addOtherIncome: { mutate: () => Promise.resolve({ id: 'i1' }) },
  removeOtherIncome: { mutate: () => Promise.resolve({}) },
};
