import type { AccountsClient } from './AccountsStep';

/** Test helper: the account calls of a client, for tests that are not about accounts. */
export const accountsStub: AccountsClient = {
  setupAccounts: {
    query: () =>
      Promise.resolve({
        accounts: [
          {
            id: 'a1',
            name: 'Joint checking',
            type: 'checking' as const,
            balanceCents: 100_000,
            isPrimaryChecking: true,
          },
        ],
        cushionCents: 100_000,
      }),
  },
  addAccount: { mutate: () => Promise.resolve({ id: 'a2' }) },
  removeAccount: { mutate: () => Promise.resolve({}) },
  setCushion: { mutate: () => Promise.resolve({}) },
};
