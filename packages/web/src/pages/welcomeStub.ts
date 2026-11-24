import type { WelcomeClient } from './WelcomeStep';

/** Test helper: the first-month calls of a client, for tests that are not about step 1. */
export const welcomeStub: WelcomeClient = {
  firstMonthOptions: {
    query: () =>
      Promise.resolve({
        thisMonth: '2026-11',
        nextMonth: '2026-12',
        firstMonth: '2026-11',
        opened: false,
      }),
  },
  startFirstMonth: { mutate: () => Promise.resolve({ firstMonth: '2026-11' }) },
};
