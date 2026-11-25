import { billDraftError, dollarText, parseDollars } from '@withinmeans/domain';
import type { RecurringBillItem } from '@withinmeans/domain';
import { useId, useState } from 'react';
import type { CategoryRow } from '../CategoriesStep';
import type { BillInput } from '../RecurringPage';

export interface BillFormProps {
  /** The bill being edited; undefined to add one. */
  bill?: RecurringBillItem;
  categories: CategoryRow[];
  saving: boolean;
  onSave: (input: BillInput) => void;
  onCancel: () => void;
  onEnd: () => void;
  onDelete: () => void;
  /** Shows the draft's problem; null clears it. */
  onProblem: (problem: string | null) => void;
}

/** Spec §6.3: the add form, and the edit form with End and Delete. */
export function BillForm({
  bill,
  categories,
  saving,
  onSave,
  onCancel,
  onEnd,
  onDelete,
  onProblem,
}: BillFormProps) {
  const id = useId();
  const [name, setName] = useState(bill?.name ?? '');
  const [estimate, setEstimate] = useState(bill ? dollarText(bill.estimateCents) : '');
  const [dueDay, setDueDay] = useState(bill ? String(bill.dueDay) : '');
  const [categoryId, setCategoryId] = useState(bill?.categoryId ?? categories[0]?.id ?? '');
  const [autopay, setAutopay] = useState(bill?.autopay ?? false);
  const [confirming, setConfirming] = useState(false);
  const title = bill ? `Edit ${bill.name}` : 'Add recurring bill';

  const submit = () => {
    const error = billDraftError({ name, estimateText: estimate, dueDayText: dueDay });
    onProblem(error ?? null);
    if (error !== undefined) return;
    onSave({
      name: name.trim(),
      estimateCents: parseDollars(estimate) ?? 0,
      dueDay: Number(dueDay),
      categoryId,
      autopay,
    });
  };

  return (
    <form
      className="card bill-form"
      aria-label={title}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <h2>{title}</h2>
      {categories.length === 0 && <p>Add a bill category first, under Manage categories.</p>}
      <div className="bill-form-fields">
        <div className="field">
          <label htmlFor={`${id}-name`}>Bill name</label>
          <input
            id={`${id}-name`}
            type="text"
            // The form opens above the list: focus brings it into view.
            autoFocus
            placeholder="e.g. Electric"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={`${id}-estimate`}>Estimate</label>
          <input
            id={`${id}-estimate`}
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={estimate}
            onChange={(e) => setEstimate(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={`${id}-due`}>Due day</label>
          <input
            id={`${id}-due`}
            type="text"
            inputMode="numeric"
            placeholder="1–28"
            value={dueDay}
            onChange={(e) => setDueDay(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={`${id}-category`}>Category</label>
          <select
            id={`${id}-category`}
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <label className="check-field">
          <input type="checkbox" checked={autopay} onChange={(e) => setAutopay(e.target.checked)} />
          Autopay
        </label>
      </div>
      {bill && (
        <p className="help">
          Changes also apply to this month&apos;s bill if it isn&apos;t paid yet. Ending a bill
          keeps its history, and you can restart it.
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="button" disabled={saving || categories.length === 0}>
          Save bill
        </button>
        <button type="button" className="button button-quiet" onClick={onCancel}>
          Cancel
        </button>
        {bill && !confirming && (
          <>
            <button type="button" className="button button-quiet" disabled={saving} onClick={onEnd}>
              End bill
            </button>
            <button
              type="button"
              className="button button-danger"
              disabled={saving}
              onClick={() => setConfirming(true)}
            >
              Delete bill
            </button>
          </>
        )}
      </div>
      {bill && confirming && (
        <div className="confirm">
          <p>
            Delete {bill.name}? Its unpaid bills from this month on are removed. Months that keep a
            record of it stay as they are, and it is then listed under Ended bills.
          </p>
          <button
            type="button"
            className="button button-danger"
            disabled={saving}
            onClick={onDelete}
          >
            Yes, delete
          </button>
          <button
            type="button"
            className="button button-quiet"
            onClick={() => setConfirming(false)}
          >
            Keep it
          </button>
        </div>
      )}
    </form>
  );
}
