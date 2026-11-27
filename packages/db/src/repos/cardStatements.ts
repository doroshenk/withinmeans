import type { Selectable } from 'kysely';
import type { HouseholdContext } from '../context.js';
import type { CardStatementsTable, Database } from '../db.js';

export type CardStatement = Selectable<CardStatementsTable>;

export interface NewStatement {
  cardId: string;
  ym: string;
  statementCents: number;
  minimumCents: number;
  plannedPaymentCents: number;
  /** Records the planned amount as paid, unless something was already paid. */
  alreadyPaid?: boolean;
}

const notImplemented = (): never => {
  throw new Error('not implemented');
};

export const cardStatements = {
  async listForMonths(
    _db: Database,
    _ctx: HouseholdContext,
    _yms: readonly string[],
  ): Promise<CardStatement[]> {
    return notImplemented();
  },

  async save(
    _db: Database,
    _ctx: HouseholdContext,
    _input: NewStatement,
    _now: Date,
  ): Promise<void> {
    return notImplemented();
  },

  async markPaid(
    _db: Database,
    _ctx: HouseholdContext,
    _cardId: string,
    _ym: string,
    _paidCents: number,
    _at: Date,
  ): Promise<void> {
    return notImplemented();
  },

  async unmarkPaid(
    _db: Database,
    _ctx: HouseholdContext,
    _cardId: string,
    _ym: string,
  ): Promise<void> {
    return notImplemented();
  },
};
