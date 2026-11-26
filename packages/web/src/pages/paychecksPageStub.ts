import type { PaychecksPageClient } from './paychecks/types';

type Calls = Omit<PaychecksPageClient, 'otherIncome' | 'addOtherIncome' | 'removeOtherIncome'>;

const done = () => Promise.resolve({});

/** Test helper: the Paychecks page's own calls, for tests that are not about them. */
export const paychecksPageStub: Calls = {
  paychecksPage: {
    query: () =>
      Promise.resolve({
        today: '2026-11-18',
        ym: '2026-11',
        status: 'open',
        paychecks: [],
        schedules: [],
        accounts: [],
      }),
  },
  addPaySchedule: { mutate: done },
  updatePaySchedule: { mutate: done },
  stopPaySchedule: { mutate: done },
  restartPaySchedule: { mutate: done },
  markPaycheckReceived: { mutate: done },
  unmarkPaycheckReceived: { mutate: done },
};
