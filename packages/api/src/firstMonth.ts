import type { MemberContext } from './invitePartner.js';

type Ctx = Pick<MemberContext, 'db' | 'household' | 'clock'>;

export interface FirstMonthOptions {
  thisMonth: string;
  nextMonth: string;
  /** The household's saved first month. */
  firstMonth: string;
  /** True once that month has been opened (the choice is made). */
  opened: boolean;
}

/** Spec §3 step 1: the two months to pick from, in the household's time zone. */
export async function firstMonthOptions(_ctx: Ctx): Promise<FirstMonthOptions> {
  throw new Error('not implemented');
}

/** Spec §3 step 1: sets the first month and calls `openMonth`. */
export async function startFirstMonth(
  _ctx: Ctx,
  _input: { choice: 'this' | 'next' },
): Promise<{ firstMonth: string }> {
  throw new Error('not implemented');
}
