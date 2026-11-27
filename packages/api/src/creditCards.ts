import type { CardRow, UsualPlan } from '@withinmeans/domain';
import type { MemberContext } from './invitePartner.js';

type Ctx = Pick<MemberContext, 'db' | 'household' | 'clock'>;

export interface CreditCardView {
  id: string;
  nickname: string;
  dueDay: number;
  usualPlan: UsualPlan;
}

const notImplemented = (): never => {
  throw new Error('not implemented');
};

export async function listCreditCards(_ctx: Ctx): Promise<CreditCardView[]> {
  return notImplemented();
}

export async function monthCards(_ctx: Ctx, _ym: string): Promise<CardRow[]> {
  return notImplemented();
}

export async function addCreditCard(_ctx: Ctx, _input: unknown): Promise<{ id: string }> {
  return notImplemented();
}

export async function removeCreditCard(_ctx: Ctx, _input: unknown): Promise<void> {
  return notImplemented();
}

export async function saveCardStatement(_ctx: Ctx, _input: unknown): Promise<void> {
  return notImplemented();
}

export async function markCardPaid(_ctx: Ctx, _input: unknown): Promise<void> {
  return notImplemented();
}

export async function unmarkCardPaid(_ctx: Ctx, _input: unknown): Promise<void> {
  return notImplemented();
}
