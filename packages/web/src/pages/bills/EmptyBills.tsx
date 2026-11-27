import { formatMoney } from '@withinmeans/domain';
import { useId } from 'react';

const PREVIEW = ['Bills + cards this month', 'Paid so far', 'Left after bills'] as const;

export interface EmptyBillsProps {
  month: string;
  /** False for a view-only member and a closed month. */
  canWrite: boolean;
  saving: boolean;
  showPreview: boolean;
  /** Given when the month can be opened. */
  onOpen: (() => void) | undefined;
  onAdd: () => void;
  onRecurring: () => void;
}

/** Spec §6.14: a month with no bills. One main button and one alternative. */
export function EmptyBills({
  month,
  canWrite,
  saving,
  showPreview,
  onOpen,
  onAdd,
  onRecurring,
}: EmptyBillsProps) {
  const id = useId();
  return (
    <>
      <section className="card empty-main" aria-labelledby={`${id}-title`}>
        <span className="empty-icon" aria-hidden="true">
          $
        </span>
        <h2 id={`${id}-title`}>No bills in {month} yet</h2>
        <p>
          {onOpen
            ? `Open ${month} to add its recurring bills and paychecks.`
            : 'Recurring and one-time bills show up here, week by week.'}
        </p>
        {canWrite && (
          <div className="form-actions">
            {onOpen && (
              <button type="button" className="button" disabled={saving} onClick={onOpen}>
                Open {month}
              </button>
            )}
            <button
              type="button"
              className={onOpen ? 'button button-quiet' : 'button'}
              onClick={onAdd}
            >
              Add one-time bill
            </button>
            {!onOpen && (
              <button type="button" className="button button-quiet" onClick={onRecurring}>
                Add recurring bills
              </button>
            )}
          </div>
        )}
      </section>
      {showPreview && (
        <div className="empty-preview" data-testid="empty-preview" aria-hidden="true">
          {PREVIEW.map((label) => (
            <div key={label} className="tile">
              <p className="tile-label">{label}</p>
              <p className="tile-value">{formatMoney(0)}</p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
