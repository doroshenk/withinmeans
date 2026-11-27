import type { CardsClient } from './cards/types';

/** Test helper: the credit card calls of setup, for tests that are not about cards. */
export const cardsStub: CardsClient = {
  creditCards: { query: () => Promise.resolve([]) },
  addCreditCard: { mutate: () => Promise.resolve({ id: 'c1' }) },
  removeCreditCard: { mutate: () => Promise.resolve({}) },
};
