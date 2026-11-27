import {
  cardChangeText,
  cardPlanText,
  carryText,
  dollarText,
  formatMoney,
  formatMonthDay,
  ordinal,
  paidDraftError,
  parseDollars,
  type CardRow,
} from '@withinmeans/domain';
import { useId, useState } from 'react';

export interface CardsCardProps {
  month: string;
  /** "YYYY-MM" */
  ym: string;
  cards: CardRow[];
  /** The planned payments, added up. */
  totalCents: number;
  /** False for a view-only member and a closed month. */
  changeable: boolean;
  saving: boolean;
  problem: string | null;
  /** Shows the draft's problem; null clears it. */
  onProblem: (problem: string | null) => void;
  onEnter: (card: CardRow) => void;
  /** Resolves true once saved. */
  onPaid: (card: CardRow, paidCents: number) => Promise<boolean>;
  onUndo: (card: CardRow) => void;
  onAddCard: () => void;
}

/** "Credit cards": each card's balance for the month, or that it is still to be entered. */
export function CardsCard({
  month,
  cards,
  totalCents,
  changeable,
  problem,
  onAddCard,
  ...rows
}: CardsCardProps) {
  const id = useId();
  return (
    <section className="card" aria-labelledby={`${id}-title`}>
      <div className="card-head">
        <h2 id={`${id}-title`}>Credit cards</h2>
        {cards.some((c) => c.statement !== null) && (
          <p className="help">{`${formatMoney(totalCents)} total`}</p>
        )}
      </div>
      {problem !== null && (
        <p role="alert" className="error">
          {problem}
        </p>
      )}
      {cards.length === 0 ? (
        <p className="help">No credit cards yet</p>
      ) : (
        <ul className="card-rows">
          {cards.map((card) => (
            <CardItem
              key={card.cardId}
              card={card}
              month={month}
              changeable={changeable}
              {...rows}
            />
          ))}
        </ul>
      )}
      {changeable && (
        <button type="button" className="link-button" onClick={onAddCard}>
          Add a card
        </button>
      )}
    </section>
  );
}

type CardItemProps = Pick<
  CardsCardProps,
  'month' | 'ym' | 'changeable' | 'saving' | 'onProblem' | 'onEnter' | 'onPaid' | 'onUndo'
> & { card: CardRow };

function CardItem({
  card,
  month,
  ym,
  changeable,
  saving,
  onProblem,
  onEnter,
  onPaid,
  onUndo,
}: CardItemProps) {
  const id = useId();
  const [amount, setAmount] = useState<string | null>(null);
  const { statement, nickname } = card;
  const carried = carryText(card.carriedCents);

  const pay = async () => {
    const text = amount ?? '';
    const error = paidDraftError(text);
    onProblem(error ?? null);
    if (error !== undefined) return;
    if (await onPaid(card, parseDollars(text) ?? 0)) setAmount(null);
  };

  return (
    <li
      className={statement === null ? 'card-row card-row-missing' : 'card-row'}
      aria-label={nickname}
    >
      <div className="card-what">
        <strong>{nickname}</strong>
        {statement === null ? (
          <span className="card-missing">
            {`No ${month} balance yet · Due around the ${ordinal(card.dueDay)}`}
          </span>
        ) : (
          <>
            <span>
              {`Due ${formatMonthDay(card.dueDate)}`}
              {card.previousCents !== null &&
                ` · ${cardChangeText(statement.statementCents, card.previousCents, ym)}`}
            </span>
            <span
              // Amber when part of the balance will carry over (design/Bills.png).
              className={
                statement.paidCents === null &&
                statement.plannedPaymentCents < statement.statementCents
                  ? 'card-plan card-plan-part'
                  : 'card-plan'
              }
            >
              {cardPlanText(statement)}
            </span>
          </>
        )}
        {carried !== null && <span className="card-missing">{carried}</span>}
      </div>
      {statement !== null && (
        <strong className="card-amount">{formatMoney(statement.statementCents)}</strong>
      )}
      {changeable && (
        <div className="card-actions">
          {statement === null ? (
            <button
              type="button"
              className="button"
              aria-label={`Enter ${nickname} balance`}
              onClick={() => onEnter(card)}
            >
              Enter balance
            </button>
          ) : (
            <>
              <button
                type="button"
                className="icon-button"
                aria-label={`Edit ${nickname} balance`}
                onClick={() => onEnter(card)}
              >
                <span aria-hidden="true">✎</span>
              </button>
              {statement.paidCents !== null ? (
                <button
                  type="button"
                  className="button button-quiet"
                  aria-label={`Undo ${nickname} payment`}
                  disabled={saving}
                  onClick={() => onUndo(card)}
                >
                  Undo
                </button>
              ) : (
                amount === null && (
                  <button
                    type="button"
                    className="button button-quiet"
                    aria-label={`Mark ${nickname} paid`}
                    onClick={() => {
                      onProblem(null);
                      setAmount(dollarText(statement.plannedPaymentCents));
                    }}
                  >
                    Mark paid
                  </button>
                )
              )}
            </>
          )}
        </div>
      )}
      {changeable && amount !== null && statement?.paidCents === null && (
        <form
          className="card-pay"
          aria-label={`Mark ${nickname} paid`}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void pay();
          }}
        >
          <div className="field">
            <label htmlFor={`${id}-paid`}>Amount paid</label>
            <input
              id={`${id}-paid`}
              type="text"
              inputMode="decimal"
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="form-actions">
            <button
              type="button"
              className="button button-quiet"
              onClick={() => {
                onProblem(null);
                setAmount(null);
              }}
            >
              Cancel
            </button>
            <button type="submit" className="button" disabled={saving}>
              Confirm paid
            </button>
          </div>
        </form>
      )}
    </li>
  );
}
