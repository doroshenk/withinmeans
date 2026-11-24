import type { MemberContext } from './invitePartner.js';

type Ctx = Pick<MemberContext, 'db' | 'household'>;

export interface SetupBillView {
  id: string;
  name: string;
  estimateCents: number;
  dueDay: number;
  categoryId: string;
  categoryName: string;
  autopay: boolean;
}

export interface SetupBillsView {
  bills: SetupBillView[];
  totalCents: number;
  takeHomeCents: number | null;
}

export function listSetupBills(_ctx: Ctx): Promise<SetupBillsView> {
  throw new Error('not implemented');
}

export function addSetupBill(
  _ctx: Ctx,
  _input: {
    name: string;
    estimateCents: number;
    dueDay: number;
    categoryId: string;
    autopay: boolean;
  },
): Promise<{ id: string }> {
  throw new Error('not implemented');
}

export function removeSetupBill(_ctx: Ctx, _input: { id: string }): Promise<void> {
  throw new Error('not implemented');
}
