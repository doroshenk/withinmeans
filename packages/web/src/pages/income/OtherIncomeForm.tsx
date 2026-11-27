import {
  OTHER_INCOME_TYPE_LABELS,
  OTHER_INCOME_TYPES,
  otherIncomeDraftError,
  parseDollars,
  type OtherIncomeType,
} from '@withinmeans/domain';
import { useId, useState, type ReactNode, type Ref } from 'react';
import type { OtherIncomeData, OtherIncomeInput } from '../PaychecksPage';

export interface OtherIncomeFormProps {
  sourceRef: Ref<HTMLInputElement>;
  /** "YYYY-MM-DD" */
  today: string;
  accounts: OtherIncomeData['accounts'];
  recent: OtherIncomeData['recent'];
  saving: boolean;
  problem: string | null;
  /** Shows the draft's problem; null clears it. */
  onProblem: (problem: string | null) => void;
  /** Resolves true once saved. */
  onSave: (input: OtherIncomeInput) => Promise<boolean>;
  /** Quick Add's line saying where the entry will go. */
  destination?: (date: string) => ReactNode;
}

/** Spec §6.4: the one-time income form. */
export function OtherIncomeForm({
  sourceRef,
  today,
  accounts,
  recent,
  saving,
  problem,
  onProblem,
  onSave,
  destination,
}: OtherIncomeFormProps) {
  const id = useId();
  const [source, setSource] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [type, setType] = useState<OtherIncomeType>('side_work');
  const [picked, setPicked] = useState<string | null>(null);
  const [note, setNote] = useState('');
  // The picked account while it exists, else primary checking, else the first.
  const accountId = (
    accounts.find((a) => a.id === picked) ??
    accounts.find((a) => a.isPrimary) ??
    accounts[0]
  )?.id;

  const submit = async () => {
    const error = otherIncomeDraftError({ source, amountText: amount, date });
    onProblem(error ?? null);
    if (error !== undefined) return;
    const saved = await onSave({
      source: source.trim(),
      amountCents: parseDollars(amount) ?? 0,
      date,
      type,
      ...(accountId !== undefined && { accountId }),
      ...(note.trim() !== '' && { note: note.trim() }),
    });
    if (!saved) return;
    // Date, type and account stay, for entering several in a row.
    setSource('');
    setAmount('');
    setNote('');
  };

  return (
    <form
      className="card income-form"
      aria-labelledby={`${id}-title`}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <h2 id={`${id}-title`}>Add one-time income</h2>
      <p className="help">
        Side work, refunds, things you sold, gifts. Enter it when the money comes in.
      </p>
      <div className="income-fields">
        <div className="field income-wide">
          <label htmlFor={`${id}-source`}>Source</label>
          <input
            ref={sourceRef}
            id={`${id}-source`}
            type="text"
            placeholder="e.g. Freelance web work"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          />
        </div>
        {recent.length > 0 && (
          <div className="income-recent income-wide">
            <span>Recent:</span>
            {recent.map((r) => (
              <button
                key={r.source}
                type="button"
                className="chip-button"
                onClick={() => {
                  setSource(r.source);
                  setType(r.type);
                  setPicked(r.accountId);
                }}
              >
                {r.source}
              </button>
            ))}
          </div>
        )}
        <div className="field">
          <label htmlFor={`${id}-amount`}>Amount</label>
          <input
            id={`${id}-amount`}
            type="text"
            inputMode="decimal"
            placeholder="0.00"
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
        <div className="field">
          <label htmlFor={`${id}-type`}>Type</label>
          <select
            id={`${id}-type`}
            value={type}
            onChange={(e) => setType(e.target.value as OtherIncomeType)}
          >
            {OTHER_INCOME_TYPES.map((t) => (
              <option key={t} value={t}>
                {OTHER_INCOME_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        {accounts.length > 0 && (
          <div className="field">
            <label htmlFor={`${id}-account`}>Deposited into</label>
            <select
              id={`${id}-account`}
              value={accountId}
              onChange={(e) => setPicked(e.target.value)}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="field income-wide">
          <label htmlFor={`${id}-note`}>Note (optional)</label>
          <input
            id={`${id}-note`}
            type="text"
            placeholder="e.g. Invoice #14"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </div>
      {problem !== null && (
        <p role="alert" className="error">
          {problem}
        </p>
      )}
      {destination?.(date)}
      <button type="submit" className="button income-submit" disabled={saving}>
        Add income
      </button>
    </form>
  );
}
