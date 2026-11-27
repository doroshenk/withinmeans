import {
  cardDraftError,
  USUAL_PLAN_LABELS,
  USUAL_PLANS,
  type UsualPlan,
} from '@withinmeans/domain';
import { useId, useState } from 'react';
import type { NewCardInput } from './types';

export interface CardFormProps {
  saving: boolean;
  problem: string | null;
  /** Shows the draft's problem; null clears it. */
  onProblem: (problem: string | null) => void;
  /** Resolves true once saved. */
  onSave: (input: NewCardInput) => Promise<boolean>;
  /** Given when the form can be closed. */
  onCancel?: () => void;
}

/** Spec §3 step 6: a card's nickname, usual due day and usual payment. Never its number. */
export function CardForm({ saving, problem, onProblem, onSave, onCancel }: CardFormProps) {
  const id = useId();
  const [nickname, setNickname] = useState('');
  const [dueDay, setDueDay] = useState('');
  const [usualPlan, setUsualPlan] = useState<UsualPlan>('full');

  const submit = async () => {
    const error = cardDraftError({ nickname, dueDayText: dueDay });
    onProblem(error ?? null);
    if (error !== undefined) return;
    const saved = await onSave({
      nickname: nickname.trim(),
      dueDay: Number(dueDay),
      usualPlan,
    });
    if (saved) {
      setNickname('');
      setDueDay('');
      setUsualPlan('full');
    }
  };

  return (
    <form
      className="card-add"
      aria-label="Add a card"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <p className="help">Never enter a card number. A nickname is enough.</p>
      {problem !== null && (
        <p role="alert" className="error">
          {problem}
        </p>
      )}
      <div className="bill-entry-fields">
        <div className="field">
          <label htmlFor={`${id}-nickname`}>Nickname</label>
          <input
            id={`${id}-nickname`}
            type="text"
            placeholder="e.g. Travel card"
            autoComplete="off"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={`${id}-day`}>Usual due day</label>
          <input
            id={`${id}-day`}
            type="text"
            inputMode="numeric"
            placeholder="1–31"
            autoComplete="off"
            value={dueDay}
            onChange={(e) => setDueDay(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={`${id}-plan`}>Usual payment</label>
          <select
            id={`${id}-plan`}
            value={usualPlan}
            onChange={(e) => setUsualPlan(e.target.value as UsualPlan)}
          >
            {USUAL_PLANS.map((plan) => (
              <option key={plan} value={plan}>
                {USUAL_PLAN_LABELS[plan]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="form-actions">
        {onCancel && (
          <button type="button" className="button button-quiet" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="button" disabled={saving}>
          Add card
        </button>
      </div>
    </form>
  );
}
