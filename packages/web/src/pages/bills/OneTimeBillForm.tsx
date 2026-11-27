import {
  billAmountCents,
  billEditDraftError,
  dollarText,
  monthName,
  oneTimeBillDraftError,
  parseDollars,
} from '@withinmeans/domain';
import { useId, useState } from 'react';
import type { BillFields, BillsData, BillsPageRow } from './types';

export interface OneTimeBillFormProps {
  /** The bill being edited; undefined for a new one-time bill. */
  bill: BillsPageRow | undefined;
  /** The month shown. */
  ym: string;
  today: string;
  categories: BillsData['categories'];
  saving: boolean;
  problem: string | null;
  /** Shows the draft's problem; null clears it. */
  onProblem: (problem: string | null) => void;
  onCancel: () => void;
  onSave: (fields: BillFields, paid: boolean) => void;
}

/** Spec §6.2: adds a one-time bill, or changes one month's bill. */
export function OneTimeBillForm({
  bill,
  ym,
  today,
  categories,
  saving,
  problem,
  onProblem,
  onCancel,
  onSave,
}: OneTimeBillFormProps) {
  const id = useId();
  const [name, setName] = useState(bill?.name ?? '');
  const [amount, setAmount] = useState(bill ? dollarText(billAmountCents(bill)) : '');
  const [date, setDate] = useState(
    bill?.dueDate ?? (today.startsWith(`${ym}-`) ? today : `${ym}-01`),
  );
  const [categoryId, setCategoryId] = useState(bill?.categoryId ?? '');
  const [paid, setPaid] = useState(false);
  const title = bill ? `Edit ${bill.name}` : 'Add one-time bill';

  const submit = () => {
    const draft = { name, amountText: amount, date, categoryId };
    const error = bill ? billEditDraftError(draft, ym, bill.kind) : oneTimeBillDraftError(draft);
    onProblem(error ?? null);
    if (error !== undefined) return;
    onSave(
      { name: name.trim(), amountCents: parseDollars(amount) ?? 0, dueDate: date, categoryId },
      paid,
    );
  };

  return (
    <form
      className="card bill-entry"
      aria-labelledby={`${id}-title`}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <h2 id={`${id}-title`}>{title}</h2>
      {bill?.kind === 'recurring' && (
        <p className="help">
          This changes {monthName(ym)} only. Enter the real amount; the recurring bill stays as it
          is.
        </p>
      )}
      {problem !== null && (
        <p role="alert" className="error">
          {problem}
        </p>
      )}
      <div className="bill-entry-fields">
        <div className="field">
          <label htmlFor={`${id}-name`}>Bill name</label>
          <input
            id={`${id}-name`}
            type="text"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={`${id}-amount`}>Amount</label>
          <input
            id={`${id}-amount`}
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={`${id}-date`}>Due date</label>
          <input
            id={`${id}-date`}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={`${id}-category`}>Category</label>
          <select
            id={`${id}-category`}
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">Choose a category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {!bill && (
        <fieldset className="bill-paid-choice">
          <legend>Paid yet?</legend>
          {[false, true].map((value) => (
            <label key={String(value)}>
              <input
                type="radio"
                name={`${id}-paid`}
                checked={paid === value}
                onChange={() => setPaid(value)}
              />
              {value ? 'Paid' : 'Still owed'}
            </label>
          ))}
        </fieldset>
      )}
      <div className="form-actions">
        <button type="button" className="button button-quiet" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="button" disabled={saving}>
          {bill ? 'Save bill' : 'Add bill'}
        </button>
      </div>
    </form>
  );
}
