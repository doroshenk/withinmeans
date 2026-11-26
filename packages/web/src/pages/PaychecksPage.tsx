import type { OtherIncomeItem, OtherIncomeType, RecentSource } from '@withinmeans/domain';

export interface OtherIncomeData {
  /** "YYYY-MM-DD" in the household's time zone. */
  today: string;
  /** The month listed. */
  ym: string;
  entries: (OtherIncomeItem & { accountName: string | null })[];
  recent: RecentSource[];
  accounts: { id: string; name: string; isPrimary: boolean }[];
}

export interface OtherIncomeInput {
  date: string;
  source: string;
  type: OtherIncomeType;
  amountCents: number;
  accountId?: string;
  note?: string;
}

export interface OtherIncomeClient {
  otherIncome: { query: (input: { ym?: string }) => Promise<OtherIncomeData> };
  addOtherIncome: { mutate: (input: OtherIncomeInput) => Promise<unknown> };
  removeOtherIncome: { mutate: (input: { id: string }) => Promise<unknown> };
}

/** Spec §6.4. One-time income for now; P2-09 adds the paychecks, schedules and month navigator. */
export function PaychecksPage(_props: { client: OtherIncomeClient }) {
  return <main className="page">not implemented</main>;
}
