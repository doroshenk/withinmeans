import {
  formatMoney,
  formatShortDate,
  OTHER_INCOME_TYPE_LABELS,
  otherIncomeTotalCents,
} from '@withinmeans/domain';
import { useId, useState } from 'react';
import { useCan } from '../../permissions';
import type { OtherIncomeData } from '../PaychecksPage';

export interface OtherIncomeListProps {
  /** "November" */
  month: string;
  entries: OtherIncomeData['entries'];
  saving: boolean;
  problem: string | null;
  /** A closed month: nothing can be removed. */
  readOnly?: boolean;
  onRemove: (id: string) => void;
}

/** Spec §6.4: the month's one-time income, with its total. */
export function OtherIncomeList({
  month,
  entries,
  saving,
  problem,
  readOnly = false,
  onRemove,
}: OtherIncomeListProps) {
  const can = useCan();
  const removable = can.write && !readOnly;
  const id = useId();
  const [confirming, setConfirming] = useState<string | null>(null);

  return (
    <section className="card" aria-labelledby={`${id}-title`}>
      <div className="card-head">
        <h2 id={`${id}-title`}>Other income in {month}</h2>
        <p className="income-total" data-testid="other-income-total">
          {formatMoney(otherIncomeTotalCents(entries))}
        </p>
      </div>
      {problem !== null && (
        <p role="alert" className="error">
          {problem}
        </p>
      )}
      {entries.length === 0 ? (
        <div className="section-empty">
          <p>
            <strong>No one-time income in {month}</strong>
          </p>
          <p className="help">Refunds, sales and side work show up here.</p>
        </div>
      ) : (
        <ul className="income-list">
          {entries.map((entry) => (
            <li key={entry.id}>
              <span className={`income-initial income-${entry.type}`} aria-hidden="true">
                {entry.source.charAt(0).toUpperCase()}
              </span>
              <div className="income-what">
                <strong>{entry.source}</strong>
                <span>
                  {[
                    formatShortDate(entry.date),
                    OTHER_INCOME_TYPE_LABELS[entry.type],
                    entry.accountName,
                    entry.note,
                  ]
                    .filter((part) => part !== null)
                    .join(' · ')}
                </span>
              </div>
              <strong className="income-amount">+{formatMoney(entry.amountCents)}</strong>
              {removable && (
                <button
                  type="button"
                  className="button button-quiet icon-danger"
                  aria-label={`Remove ${entry.source}`}
                  disabled={saving}
                  onClick={() => setConfirming(entry.id)}
                >
                  <span aria-hidden="true">✕</span>
                </button>
              )}
              {removable && confirming === entry.id && (
                <div className="confirm income-confirm">
                  <p>
                    Remove {entry.source}, {formatMoney(entry.amountCents)}?
                  </p>
                  <button
                    type="button"
                    className="button button-danger"
                    disabled={saving}
                    onClick={() => {
                      setConfirming(null);
                      onRemove(entry.id);
                    }}
                  >
                    Yes, remove
                  </button>
                  <button
                    type="button"
                    className="button button-quiet"
                    onClick={() => setConfirming(null)}
                  >
                    Keep it
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
