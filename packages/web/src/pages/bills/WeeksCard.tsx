import {
  billAmountCents,
  formatMoney,
  formatMonthDay,
  type BillWeek,
  type BillWeekState,
} from '@withinmeans/domain';
import { useId, useState } from 'react';
import { categoryChipStyle } from '../recurring/categoryChipStyle';
import type { BillsData, BillsPageRow } from './types';

const STATE_LABEL: Record<Exclude<BillWeekState, 'none'>, string> = {
  paid: 'All paid',
  partly: 'Partly paid',
  'to-pay': 'To pay',
};

export interface WeeksCardProps {
  month: string;
  weeks: BillWeek<BillsPageRow>[];
  paidCount: number;
  billCount: number;
  categories: BillsData['categories'];
  /** False for a view-only member and a closed month. */
  changeable: boolean;
  saving: boolean;
  problem: string | null;
  onPaid: (bill: BillsPageRow, paid: boolean) => void;
  onEdit: (bill: BillsPageRow) => void;
  onDelete: (bill: BillsPageRow) => void;
  onRecurring: () => void;
}

/** "Bills, week by week": four collapsible weeks. */
export function WeeksCard({
  month,
  weeks,
  paidCount,
  billCount,
  onRecurring,
  problem,
  ...rows
}: WeeksCardProps) {
  const id = useId();
  const [open, setOpen] = useState(() => weeks.map((w) => w.startsOpen));

  return (
    <section className="card" aria-labelledby={`${id}-title`}>
      <div className="card-head bill-weeks-head">
        <h2 id={`${id}-title`}>Bills, week by week</h2>
        <div className="bill-weeks-actions">
          <span className="help">{`${paidCount} of ${billCount} paid`}</span>
          <button
            type="button"
            className="link-button"
            onClick={() => setOpen(weeks.map(() => true))}
          >
            Expand all
          </button>
          <button
            type="button"
            className="link-button"
            onClick={() => setOpen(weeks.map(() => false))}
          >
            Collapse all
          </button>
          <a
            href="/recurring"
            onClick={(event) => {
              event.preventDefault();
              onRecurring();
            }}
          >
            Manage recurring bills
          </a>
        </div>
      </div>
      {problem !== null && (
        <p role="alert" className="error">
          {problem}
        </p>
      )}
      {weeks.map((w, index) => (
        <section key={w.week} className="bill-week" aria-label={`Week ${w.week}`}>
          <button
            type="button"
            className="bill-week-head"
            aria-expanded={open[index]}
            onClick={() => setOpen((now) => now.map((o, i) => (i === index ? !o : o)))}
          >
            <span className="bill-week-title">
              <strong>{`Week ${w.week}`}</strong>
              {` · ${w.range}`}
            </span>
            {w.isCurrent && <span className="bill-badge bill-badge-now">This week</span>}
            <span className="bill-week-count">
              {w.bills.length > 0 &&
                `${w.paidCount} of ${w.bills.length} paid${
                  w.state === 'paid' ? '' : ` · ${formatMoney(w.leftCents)} left`
                }`}
            </span>
            {w.state !== 'none' && (
              <span className={`bill-badge bill-badge-state bill-badge-${w.state}`}>
                {STATE_LABEL[w.state]}
              </span>
            )}
            <strong className="bill-week-total">{formatMoney(w.totalCents)}</strong>
            <span className="bill-week-chevron" aria-hidden="true">
              {open[index] ? '▴' : '▾'}
            </span>
          </button>
          {open[index] &&
            (w.bills.length === 0 ? (
              <p className="help bill-week-empty">Nothing due this week</p>
            ) : (
              <ul className="bill-rows">
                {w.bills.map((bill, position) => (
                  <BillRow
                    // A preview row has no id, and two may share a name and date.
                    key={bill.id ?? `preview ${position}`}
                    bill={bill}
                    month={month}
                    {...rows}
                  />
                ))}
              </ul>
            ))}
        </section>
      ))}
    </section>
  );
}

type BillRowProps = Pick<
  WeeksCardProps,
  'month' | 'categories' | 'changeable' | 'saving' | 'onPaid' | 'onEdit' | 'onDelete'
> & { bill: BillsPageRow };

function BillRow({
  bill,
  month,
  categories,
  changeable,
  saving,
  onPaid,
  onEdit,
  onDelete,
}: BillRowProps) {
  const [deleting, setDeleting] = useState(false);
  const category = categories.find((c) => c.id === bill.categoryId);
  const editable = changeable && bill.id !== null;
  const recurring = bill.kind === 'recurring';

  return (
    <li className={bill.paid ? 'bill-row bill-row-paid' : 'bill-row'} aria-label={bill.name}>
      {editable ? (
        // The label makes the whole 44px square the checkbox's touch target.
        <label className="bill-check-target">
          <input
            type="checkbox"
            className="bill-check"
            aria-label={`Paid: ${bill.name}`}
            checked={bill.paid}
            disabled={saving}
            onChange={(e) => onPaid(bill, e.target.checked)}
          />
        </label>
      ) : (
        <span className="bill-state">{bill.paid ? 'Paid' : 'Not paid'}</span>
      )}
      <div className="bill-what">
        <strong>{bill.name}</strong>
        <span className="bill-meta">
          {category && (
            <span className="category-chip" style={categoryChipStyle(category.colorIndex)}>
              {category.name}
            </span>
          )}
          <span>{recurring ? 'Recurring' : 'One-time'}</span>
          <span>{`Due ${formatMonthDay(bill.dueDate)}`}</span>
          {bill.autopay && <span>Autopay</span>}
        </span>
      </div>
      <div className="bill-amount">
        <strong>{formatMoney(billAmountCents(bill))}</strong>
        {recurring && bill.actualCents === null && <span>Estimate</span>}
      </div>
      {editable && (
        <div className="bill-actions">
          <button
            type="button"
            className="icon-button"
            aria-label={`Edit ${bill.name}`}
            onClick={() => onEdit(bill)}
          >
            <span aria-hidden="true">✎</span>
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={`Delete ${bill.name}`}
            onClick={() => setDeleting(true)}
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>
      )}
      {editable && deleting && (
        <div className="bill-confirm">
          <span>{`Delete ${bill.name} from ${month}?`}</span>
          <button type="button" className="button button-quiet" onClick={() => setDeleting(false)}>
            Keep it
          </button>
          <button
            type="button"
            className="button"
            disabled={saving}
            onClick={() => {
              setDeleting(false);
              onDelete(bill);
            }}
          >
            Yes, delete
          </button>
        </div>
      )}
    </li>
  );
}
