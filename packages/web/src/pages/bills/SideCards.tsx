import {
  expectedWhenText,
  formatMoney,
  formatMonthDay,
  OTHER_INCOME_TYPE_LABELS,
  subCents,
  type BillCategoryTotal,
  type BillsMonthSummary,
} from '@withinmeans/domain';
import { useId } from 'react';
import type { BillsData } from './types';

/** "By category": the month's totals, largest first. */
export function CategoryCard({
  totals,
}: {
  totals: { rows: BillCategoryTotal[]; oneTimeCents: number };
}) {
  const id = useId();
  return (
    <section className="card" aria-labelledby={`${id}-title`}>
      <div className="card-head">
        <h2 id={`${id}-title`}>By category</h2>
        {totals.oneTimeCents > 0 && (
          <p className="help">{`incl. ${formatMoney(totals.oneTimeCents)} one-time`}</p>
        )}
      </div>
      <ul className="category-totals">
        {totals.rows.map((row) => (
          <li key={row.categoryId ?? 'cards'}>
            <span>{row.name}</span>
            <strong>{formatMoney(row.cents)}</strong>
            <div className="progress" aria-hidden="true">
              <span
                style={{
                  width: `${row.barPct}%`,
                  ...(row.colorIndex !== null && {
                    background: `var(--color-category-${row.colorIndex + 1})`,
                  }),
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export interface PaychecksCardProps {
  month: string;
  today: string;
  paychecks: BillsData['paychecks'];
  otherIncome: BillsData['otherIncome'];
  otherCents: number;
  onManage: () => void;
}

/** The month's paychecks, received and expected, and its one-time income. */
export function PaychecksCard({
  month,
  today,
  paychecks,
  otherIncome,
  otherCents,
  onManage,
}: PaychecksCardProps) {
  const id = useId();
  const types = [...new Set(otherIncome.map((i) => OTHER_INCOME_TYPE_LABELS[i.type]))];
  const entries = otherIncome.length === 1 ? 'entry' : 'entries';

  return (
    <section className="card" aria-labelledby={`${id}-title`}>
      <div className="card-head">
        <h2 id={`${id}-title`}>Paychecks</h2>
        <a
          href="/paychecks"
          onClick={(event) => {
            event.preventDefault();
            onManage();
          }}
        >
          Manage income
        </a>
      </div>
      {paychecks.length === 0 && otherIncome.length === 0 ? (
        <p className="help">No paychecks or income in {month}</p>
      ) : (
        <ul className="side-list">
          {paychecks.map((pay) => {
            const received = pay.receivedCents !== null;
            return (
              <li key={`${pay.scheduleId} ${pay.expectedDate}`}>
                <div>
                  <strong>{formatMonthDay(pay.receivedDate ?? pay.expectedDate)}</strong>
                  <span>{received ? 'Received' : expectedWhenText(pay.expectedDate, today)}</span>
                </div>
                <strong>{formatMoney(pay.receivedCents ?? pay.expectedCents)}</strong>
              </li>
            );
          })}
          {otherIncome.length > 0 && (
            <li>
              <div>
                <strong>One-time income</strong>
                <span>{`${otherIncome.length} ${entries} · ${types.join(', ').toLowerCase()}`}</span>
              </div>
              <strong>{formatMoney(otherCents)}</strong>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

/** "How {month} adds up" (spec §6.2). */
export function AddsUpCard({ month, summary }: { month: string; summary: BillsMonthSummary }) {
  const id = useId();
  const lines = [
    { label: 'Paychecks & other income', cents: summary.incomeCents },
    { label: 'Investments moved to checking', cents: summary.checkingMovedCents },
    { label: 'Bills + cards', cents: subCents(0, summary.outCents) },
    { label: 'Net for the month', cents: summary.leftCents },
  ];
  return (
    <section className="card" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>How {month} adds up</h2>
      <ul className="side-list adds-up">
        {lines.map((line) => (
          <li key={line.label}>
            <span>{line.label}</span>
            <strong>{formatMoney(line.cents)}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}
