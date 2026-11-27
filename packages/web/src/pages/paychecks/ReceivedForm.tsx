import {
  dollarText,
  parseDollars,
  receivedDraftError,
  receivedPreviewText,
} from '@withinmeans/domain';
import { useId, useState } from 'react';
import type { Received } from './PaycheckList';
import type { PageRow } from './types';

interface ReceivedFormProps {
  pay: PageRow;
  saving: boolean;
  onProblem: (problem: string | null) => void;
  onCancel: () => void;
  onSave: (value: Omit<Received, 'id'>) => Promise<void>;
  /** False where something else should keep the focus when the form appears. */
  autoFocus?: boolean;
}

/** Spec §5.9 "Mark received": the amount that landed (prefilled with the expected one) and when. */
export function ReceivedForm({
  pay,
  saving,
  onProblem,
  onCancel,
  onSave,
  autoFocus = true,
}: ReceivedFormProps) {
  const id = useId();
  const [amount, setAmount] = useState(dollarText(pay.expectedCents));
  const [date, setDate] = useState(pay.expectedDate);
  const preview = receivedPreviewText(amount, pay.expectedCents);

  const submit = () => {
    const error = receivedDraftError({ amountText: amount, date });
    onProblem(error ?? null);
    if (error !== undefined) return;
    void onSave({ receivedCents: parseDollars(amount) ?? 0, receivedDate: date });
  };

  return (
    <form
      className="pay-received-form"
      aria-label="Mark received"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <p className="help">
        Enter the amount that actually landed. Paychecks can vary, so this replaces the expected
        amount for this payday only.
      </p>
      <div className="field">
        <label htmlFor={`${id}-amount`}>Amount received</label>
        <input
          id={`${id}-amount`}
          type="text"
          inputMode="decimal"
          autoFocus={autoFocus}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor={`${id}-date`}>Date received</label>
        <input
          id={`${id}-date`}
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>
      <div className="form-actions">
        <button type="button" className="button button-quiet" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="button" disabled={saving}>
          Confirm received
        </button>
      </div>
      {preview !== null && <p className="pay-difference">{preview}</p>}
    </form>
  );
}
