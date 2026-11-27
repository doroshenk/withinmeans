import type { BillKind, OtherIncomeType } from '@withinmeans/domain';
import type { MemberContext } from './invitePartner.js';
import type { PagePaycheck } from './paychecks.js';

type Ctx = Pick<MemberContext, 'db' | 'household' | 'clock'>;

export interface BillView {
  /** Null in a preview of a month not started. */
  id: string | null;
  name: string;
  categoryId: string;
  /** "YYYY-MM-DD" */
  dueDate: string;
  estimateCents: number;
  actualCents: number | null;
  paid: boolean;
  kind: BillKind;
  autopay: boolean;
}

export interface BillsPageView {
  /** "YYYY-MM-DD" in the household's time zone. */
  today: string;
  /** The month shown. */
  ym: string;
  status: 'open' | 'closed' | 'not-started';
  /** True when "Open {month}" applies to the month. */
  canOpen: boolean;
  bills: BillView[];
  categories: { id: string; name: string; colorIndex: number }[];
  paychecks: PagePaycheck[];
  otherIncome: { id: string; type: OtherIncomeType; amountCents: number }[];
}

const notImplemented = (): never => {
  throw new Error('not implemented');
};

export async function billsPage(_ctx: Ctx, _ym?: string): Promise<BillsPageView> {
  return notImplemented();
}

export async function openBillsMonth(_ctx: Ctx, _input: unknown): Promise<{ created: boolean }> {
  return notImplemented();
}

export async function addBill(_ctx: Ctx, _input: unknown): Promise<{ id: string }> {
  return notImplemented();
}

export async function updateBill(_ctx: Ctx, _input: unknown): Promise<void> {
  return notImplemented();
}

export async function setBillPaid(_ctx: Ctx, _input: unknown): Promise<void> {
  return notImplemented();
}

export async function removeBill(_ctx: Ctx, _input: unknown): Promise<void> {
  return notImplemented();
}
