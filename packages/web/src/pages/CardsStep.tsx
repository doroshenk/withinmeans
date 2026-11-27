import { dueDayLabel, USUAL_PLAN_LABELS } from '@withinmeans/domain';
import { useCallback, useEffect, useState } from 'react';
import { GENERIC_ERROR, apiErrorMessage } from '../auth/errors';
import { useCan } from '../permissions';
import { CardForm } from './cards/CardForm';
import type { CardsClient, CreditCardView, NewCardInput } from './cards/types';

const RELOAD_ERROR = 'Saved, but this page couldn’t refresh. Reload it before trying again.';

type Load = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; cards: CreditCardView[] };

/** Spec §3 step 6: the credit cards (nickname, usual due day, usual payment). */
export function CardsStep({ client }: { client: CardsClient }) {
  const can = useCan();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchCards = useCallback(() => client.creditCards.query(), [client]);

  useEffect(() => {
    let cancelled = false;
    fetchCards().then(
      (cards) => !cancelled && setLoad({ kind: 'ready', cards }),
      () => !cancelled && setLoad({ kind: 'error' }),
    );
    return () => {
      cancelled = true;
    };
  }, [fetchCards]);

  if (load.kind === 'loading') return <p role="status">Loading…</p>;
  if (load.kind === 'error') return <p role="alert">{GENERIC_ERROR}</p>;

  /** Runs one change, then shows what the server now has. */
  const act = async (change: () => Promise<unknown>): Promise<boolean> => {
    if (saving) return false;
    setSaving(true);
    setProblem(null);
    try {
      await change();
    } catch (error) {
      setProblem(apiErrorMessage(error));
      setSaving(false);
      return false;
    }
    // The change is saved. If this reload fails, keep what is shown.
    try {
      setLoad({ kind: 'ready', cards: await fetchCards() });
    } catch {
      setProblem(RELOAD_ERROR);
    }
    setSaving(false);
    return true;
  };

  return (
    <div className="bills">
      {load.cards.length === 0 ? (
        <p>
          {can.write
            ? 'No cards yet. Add each card you pay, so its balance can count in the month.'
            : 'No cards yet. The owner or a full member will set them up.'}
        </p>
      ) : (
        <ul className="bill-list" aria-label="Credit cards">
          {load.cards.map((card) => (
            <li key={card.id} className="bill-row">
              <span className="bill-main">
                <strong>{card.nickname}</strong>
                <small>
                  {`${dueDayLabel(card.dueDay)} · ${USUAL_PLAN_LABELS[card.usualPlan]}`}
                </small>
              </span>
              {can.write && (
                <button
                  type="button"
                  className="category-delete"
                  aria-label={`Remove ${card.nickname}`}
                  disabled={saving}
                  onClick={() => void act(() => client.removeCreditCard.mutate({ id: card.id }))}
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {can.write ? (
        <CardForm
          saving={saving}
          problem={problem}
          onProblem={setProblem}
          onSave={(input: NewCardInput) => act(() => client.addCreditCard.mutate(input))}
        />
      ) : null}

      <p className="category-help">
        Only the nickname, due day and usual payment are kept. You enter each month&apos;s balance
        on Bills &amp; cash flow.
      </p>
    </div>
  );
}
