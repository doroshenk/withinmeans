import type { UsualPlan } from '@withinmeans/domain';

export interface CreditCardView {
  id: string;
  nickname: string;
  dueDay: number;
  usualPlan: UsualPlan;
}

export interface NewCardInput {
  nickname: string;
  dueDay: number;
  usualPlan: UsualPlan;
}

/** Setup step 6's calls. */
export interface CardsClient {
  creditCards: { query: () => Promise<CreditCardView[]> };
  addCreditCard: { mutate: (input: NewCardInput) => Promise<unknown> };
  removeCreditCard: { mutate: (input: { id: string }) => Promise<unknown> };
}

export interface StatementInput {
  cardId: string;
  ym: string;
  statementCents: number;
  minimumCents: number;
  plannedPaymentCents: number;
  alreadyPaid?: boolean;
}

/** The credit card calls the Bills page makes. */
export interface CardStatementsClient {
  addCreditCard: CardsClient['addCreditCard'];
  saveCardStatement: { mutate: (input: StatementInput) => Promise<unknown> };
  markCardPaid: {
    mutate: (input: { cardId: string; ym: string; paidCents: number }) => Promise<unknown>;
  };
  unmarkCardPaid: { mutate: (input: { cardId: string; ym: string }) => Promise<unknown> };
}
