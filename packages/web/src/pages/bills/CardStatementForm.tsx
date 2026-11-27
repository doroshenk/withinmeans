import {
  cardPreviousText,
  defaultPlanChoice,
  dollarText,
  formatMoney,
  monthName,
  parseCardAmount,
  planChoiceOf,
  plannedForChoice,
  statementDraftError,
  type CardRow,
  type PlanChoice,
} from '@withinmeans/domain';
import { useId, useState } from 'react';
import type { StatementInput } from '../cards/types';

const CHOICES: { value: PlanChoice; label: string }[] = [
  { value: 'full', label: 'Full balance' },
  { value: 'min', label: 'Minimum' },
  { value: 'other', label: 'Other amount' },
];

export interface CardStatementFormProps {
  /** The card whose balance is being entered. */
  card: CardRow;
  cards: CardRow[];
  /** "YYYY-MM" */
  ym: string;
  saving: boolean;
  problem: string | null;
  /** Shows the draft's problem; null clears it. */
  onProblem: (problem: string | null) => void;
  onPick: (cardId: string) => void;
  onCancel: () => void;
  onSave: (input: StatementInput) => void;
}

/** Spec §5.10: a card's statement balance, minimum and planned payment for the month. */
export function CardStatementForm({
  card,
  cards,
  ym,
  saving,
  problem,
  onProblem,
  onPick,
  onCancel,
  onSave,
}: CardStatementFormProps) {
  const id = useId();
  const { statement } = card;
  const [balance, setBalance] = useState(statement ? dollarText(statement.statementCents) : '');
  const [minimum, setMinimum] = useState(statement ? dollarText(statement.minimumCents) : '');
  const [choice, setChoice] = useState<PlanChoice>(
    statement ? planChoiceOf(statement) : defaultPlanChoice(card.usualPlan),
  );
  const [other, setOther] = useState(
    statement && planChoiceOf(statement) === 'other'
      ? dollarText(statement.plannedPaymentCents)
      : '',
  );
  const [alreadyPaid, setAlreadyPaid] = useState(false);
  const month = monthName(ym);
  // What is typed so far; an amount out of range counts as not typed until it is saved.
  const statementCents = parseCardAmount(balance);
  const planned = plannedForChoice(
    choice,
    statementCents ?? 0,
    parseCardAmount(minimum) ?? 0,
    parseCardAmount(other),
  );

  const submit = () => {
    const error = statementDraftError({
      cardId: card.cardId,
      statementText: balance,
      minimumText: minimum,
      choice,
      otherText: other,
    });
    onProblem(error ?? null);
    if (error !== undefined) return;
    onSave({
      cardId: card.cardId,
      ym,
      statementCents: statementCents ?? 0,
      minimumCents: parseCardAmount(minimum) ?? 0,
      plannedPaymentCents: planned ?? 0,
      alreadyPaid,
    });
  };

  const money = (key: string, label: string, value: string, set: (value: string) => void) => (
    <div className="field">
      <label htmlFor={`${id}-${key}`}>{label}</label>
      <input
        id={`${id}-${key}`}
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => set(e.target.value)}
      />
    </div>
  );

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
      <h2 id={`${id}-title`}>{`Enter ${card.nickname} balance`}</h2>
      <p className="help">
        Copy these from your {month} statement. What you plan to pay counts toward this month&apos;s
        bills.
      </p>
      {problem !== null && (
        <p role="alert" className="error">
          {problem}
        </p>
      )}
      <div className="bill-entry-fields">
        <div className="field">
          <label htmlFor={`${id}-card`}>Card</label>
          <select id={`${id}-card`} value={card.cardId} onChange={(e) => onPick(e.target.value)}>
            {cards.map((c) => (
              <option key={c.cardId} value={c.cardId}>
                {c.statement === null ? `${c.nickname} · not entered` : c.nickname}
              </option>
            ))}
          </select>
        </div>
        {money('balance', 'Statement balance', balance, setBalance)}
        {money('minimum', 'Minimum payment', minimum, setMinimum)}
      </div>
      {card.previousCents !== null && (
        <p className="card-previous">{cardPreviousText(card.previousCents, statementCents, ym)}</p>
      )}
      <fieldset className="bill-paid-choice">
        <legend>How much will you pay?</legend>
        {CHOICES.map((c) => (
          <label key={c.value}>
            <input
              type="radio"
              name={`${id}-plan`}
              checked={choice === c.value}
              onChange={() => setChoice(c.value)}
            />
            {c.label}
          </label>
        ))}
      </fieldset>
      {choice === 'other' && (
        <div className="bill-entry-fields">
          {money('other', 'Amount you plan to pay', other, setOther)}
        </div>
      )}
      {(statement?.paidCents ?? null) === null && (
        <label className="card-already-paid">
          <input
            type="checkbox"
            checked={alreadyPaid}
            onChange={(e) => setAlreadyPaid(e.target.checked)}
          />
          Already paid
        </label>
      )}
      <p className="card-counts">
        Counts toward {month} bills: <strong>{formatMoney(planned ?? 0)}</strong>
      </p>
      <div className="form-actions">
        <button type="button" className="button button-quiet" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="button" disabled={saving}>
          Save balance
        </button>
      </div>
    </form>
  );
}
