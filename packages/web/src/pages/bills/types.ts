import type { BillLine, CardRow, OtherIncomeType } from '@withinmeans/domain';
import type { MonthStatus } from '../../shell/MonthNavigator';
import type { CardStatementsClient } from '../cards/types';
import type { PageRow } from '../paychecks/types';

export interface BillsPageRow extends BillLine {
  /** Null in a preview of a month not started. */
  id: string | null;
  autopay: boolean;
}

export interface BillsData {
  /** "YYYY-MM-DD" in the household's time zone. */
  today: string;
  ym: string;
  status: MonthStatus;
  canOpen: boolean;
  bills: BillsPageRow[];
  categories: { id: string; name: string; colorIndex: number }[];
  paychecks: PageRow[];
  otherIncome: { id: string; type: OtherIncomeType; amountCents: number }[];
  cards: CardRow[];
}

export interface BillFields {
  name: string;
  amountCents: number;
  dueDate: string;
  categoryId: string;
}

export interface BillsPageClient extends CardStatementsClient {
  billsPage: { query: (input: { ym?: string }) => Promise<BillsData> };
  openMonth: { mutate: (input: { ym: string }) => Promise<unknown> };
  addBill: { mutate: (input: BillFields & { paid: boolean }) => Promise<unknown> };
  updateBill: { mutate: (input: BillFields & { id: string }) => Promise<unknown> };
  setBillPaid: { mutate: (input: { id: string; paid: boolean }) => Promise<unknown> };
  removeBill: { mutate: (input: { id: string }) => Promise<unknown> };
}
