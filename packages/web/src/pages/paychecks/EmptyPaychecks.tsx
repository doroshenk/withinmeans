import { formatMoney } from '@withinmeans/domain';
import { useId } from 'react';
import { useCan } from '../../permissions';

const PREVIEW = ['Received so far', 'Still expected', 'One-time income'] as const;

/** Spec §6.14: the page before any paycheck schedule or income exists. */
export function EmptyPaychecks({
  onSetUp,
  onAddIncome,
}: {
  onSetUp: () => void;
  onAddIncome: () => void;
}) {
  const can = useCan();
  const id = useId();

  return (
    <>
      <section className="card empty-main" aria-labelledby={`${id}-title`}>
        <span className="empty-icon" aria-hidden="true">
          $
        </span>
        <h2 id={`${id}-title`}>No paychecks or income yet</h2>
        <p>
          {can.write
            ? 'Set up the pay that repeats, and each payday shows up here to mark received.'
            : 'The owner or a full member will set up paychecks.'}
        </p>
        {can.write && (
          <div className="form-actions">
            <button type="button" className="button" onClick={onSetUp}>
              Set up a paycheck
            </button>
            <button type="button" className="button button-quiet" onClick={onAddIncome}>
              Add one-time income
            </button>
          </div>
        )}
      </section>
      <div className="empty-preview" data-testid="empty-preview" aria-hidden="true">
        {PREVIEW.map((label) => (
          <div key={label} className="tile">
            <p className="tile-label">{label}</p>
            <p className="tile-value">{formatMoney(0)}</p>
          </div>
        ))}
      </div>
    </>
  );
}
