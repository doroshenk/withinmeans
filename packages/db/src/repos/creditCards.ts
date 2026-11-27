import type { UsualPlan } from '@withinmeans/domain';
import type { Selectable } from 'kysely';
import type { HouseholdContext } from '../context.js';
import type { CreditCardsTable, Database } from '../db.js';

export type CreditCard = Selectable<CreditCardsTable>;

export interface NewCreditCard {
  nickname: string;
  dueDay: number;
  usualPlan: UsualPlan;
}

const notImplemented = (): never => {
  throw new Error('not implemented');
};

export const creditCards = {
  async list(
    _db: Database,
    _ctx: HouseholdContext,
    _options: { includeArchived?: boolean } = {},
  ): Promise<CreditCard[]> {
    return notImplemented();
  },

  async create(_db: Database, _ctx: HouseholdContext, _input: NewCreditCard): Promise<CreditCard> {
    return notImplemented();
  },

  async remove(_db: Database, _ctx: HouseholdContext, _id: string, _at: Date): Promise<void> {
    return notImplemented();
  },
};
