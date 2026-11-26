import type { addOtherIncomeInput, OtherIncomeItem, RecentSource } from '@withinmeans/domain';
import type { z } from 'zod';
import type { MemberContext } from './invitePartner.js';

type Ctx = Pick<MemberContext, 'db' | 'household' | 'clock'>;

export type OtherIncomeView = OtherIncomeItem & {
  /** The account it went into, even one since removed. */
  accountName: string | null;
};

export interface OtherIncomePageView {
  /** "YYYY-MM-DD" in the household's time zone. */
  today: string;
  /** The month listed. */
  ym: string;
  entries: OtherIncomeView[];
  recent: RecentSource[];
  /** The accounts money can be deposited into. */
  accounts: { id: string; name: string; isPrimary: boolean }[];
}

export async function listOtherIncome(_ctx: Ctx, _ym?: string): Promise<OtherIncomePageView> {
  throw new Error('not implemented');
}

export async function addOtherIncome(
  _ctx: Ctx,
  _input: z.infer<typeof addOtherIncomeInput>,
): Promise<{ id: string }> {
  throw new Error('not implemented');
}

export async function removeOtherIncome(_ctx: Ctx, _input: { id: string }): Promise<void> {
  throw new Error('not implemented');
}
