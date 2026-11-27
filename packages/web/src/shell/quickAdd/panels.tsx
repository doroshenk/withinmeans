import {
  addMonths,
  formatMoney,
  formatShortDate,
  monthName,
  paychecksWaiting,
  quickAddPreviewText,
  type QuickAddType,
} from '@withinmeans/domain';
import { useState, type ReactNode } from 'react';
import { GENERIC_ERROR } from '../../auth/errors';
import { CardStatementForm } from '../../pages/bills/CardStatementForm';
import { OneTimeBillForm } from '../../pages/bills/OneTimeBillForm';
import { OtherIncomeForm } from '../../pages/income/OtherIncomeForm';
import { ReceivedForm } from '../../pages/paychecks/ReceivedForm';
import type { QuickAdd } from './context';
import { useLists, type Lists } from './useLists';

/** An entry to save: how to save it, what to call it and, if it can be, how to take it back. */
export interface NewEntry {
  type: QuickAddType;
  name: string;
  amountCents: number;
  /** "YYYY-MM-DD": the date that decides its week and month. */
  date: string;
  save: () => Promise<unknown>;
  /** Given what saving answered; undefined when the entry cannot be removed. */
  undo?: (saved: unknown) => (() => Promise<unknown>) | undefined;
}

export interface PanelProps {
  quickAdd: QuickAdd;
  saving: boolean;
  problem: string | null;
  onProblem: (problem: string | null) => void;
  /** Resolves true once saved. */
  onSave: (entry: NewEntry) => Promise<boolean>;
  onClose: () => void;
  /** Leaves Quick Add for a page. */
  onGo: (route: 'bills' | 'recurring') => void;
}

/** Removes the row whose id saving answered with. */
const removeById =
  (remove: (input: { id: string }) => Promise<unknown>) =>
  (saved: unknown): (() => Promise<unknown>) | undefined => {
    const id = (saved as { id?: unknown } | null)?.id;
    return typeof id === 'string' ? () => remove({ id }) : undefined;
  };

function Loaded<T>({ lists, children }: { lists: Lists<T>; children: (data: T) => ReactNode }) {
  if (lists.kind === 'loading') return <p role="status">Loading…</p>;
  if (lists.kind === 'error') return <p role="alert">{GENERIC_ERROR}</p>;
  return <>{children(lists.data)}</>;
}

const Preview = ({ text }: { text: string | null }) =>
  text === null ? null : <p className="qa-preview">{text}</p>;

export function BillPanel(props: PanelProps) {
  const { quickAdd, saving, problem, onProblem, onSave, onClose, onGo } = props;
  const { client } = quickAdd;
  const lists = useLists(() => client.billsPage.query({}));
  /** A new form after each save, so it starts empty. */
  const [round, setRound] = useState(0);

  return (
    <Loaded lists={lists}>
      {(data) => (
        <>
          <OneTimeBillForm
            key={round}
            bill={undefined}
            ym={data.ym}
            today={data.today}
            categories={data.categories}
            saving={saving}
            problem={problem}
            onProblem={onProblem}
            onCancel={onClose}
            autoFocus={false}
            destination={(date, category) => (
              <Preview text={quickAddPreviewText('bill', date, category)} />
            )}
            onSave={(fields, paid) =>
              void onSave({
                type: 'bill',
                name: fields.name,
                amountCents: fields.amountCents,
                date: fields.dueDate,
                save: () => client.addBill.mutate({ ...fields, paid }),
                undo: removeById((input) => client.removeBill.mutate(input)),
              }).then((saved) => saved && setRound((n) => n + 1))
            }
          />
          <p className="qa-aside">
            Happens every month?{' '}
            <a
              href="/recurring"
              onClick={(event) => {
                event.preventDefault();
                onGo('recurring');
              }}
            >
              Add it as a recurring bill
            </a>
          </p>
        </>
      )}
    </Loaded>
  );
}

export function IncomePanel({ quickAdd, saving, problem, onProblem, onSave }: PanelProps) {
  const { client } = quickAdd;
  const lists = useLists(() => client.otherIncome.query({}));

  return (
    <Loaded lists={lists}>
      {(data) => (
        <OtherIncomeForm
          sourceRef={null}
          today={data.today}
          accounts={data.accounts}
          recent={data.recent}
          saving={saving}
          problem={problem}
          onProblem={onProblem}
          destination={(date) => <Preview text={quickAddPreviewText('income', date)} />}
          onSave={(input) =>
            onSave({
              type: 'income',
              name: input.source,
              amountCents: input.amountCents,
              date: input.date,
              save: () => client.addOtherIncome.mutate(input),
              undo: removeById((row) => client.removeOtherIncome.mutate(row)),
            })
          }
        />
      )}
    </Loaded>
  );
}

export function PaycheckPanel(props: PanelProps) {
  const { quickAdd, saving, problem, onProblem, onSave, onClose } = props;
  const { client } = quickAdd;
  const [picked, setPicked] = useState<string | null>(null);
  /** Marked since `from` was loaded, so not offered again if the list cannot be reloaded. */
  const [marked, setMarked] = useState<{ from: unknown; ids: string[] }>({ from: null, ids: [] });
  const lists = useLists(async () => {
    const current = await client.paychecksPage.query({});
    const others = await Promise.all(
      [-1, 1].map((step) => client.paychecksPage.query({ ym: addMonths(current.ym, step) })),
    );
    return paychecksWaiting([current, ...others]);
  });

  return (
    <Loaded lists={lists}>
      {(loaded) => {
        const hidden = marked.from === loaded ? marked.ids : [];
        const waiting = loaded.filter((p) => !hidden.includes(p.id));
        const pay = waiting.find((p) => p.id === picked) ?? waiting[0];
        if (pay === undefined) {
          return <p>No paycheck is waiting to be marked in the months you have started.</p>;
        }
        return (
          <>
            <div className="field">
              <label htmlFor="qa-paycheck">Paycheck</label>
              <select
                id="qa-paycheck"
                value={pay.id}
                onChange={(e) => {
                  onProblem(null);
                  setPicked(e.target.value);
                }}
              >
                {waiting.map((p) => (
                  <option key={p.id} value={p.id}>
                    {`${formatShortDate(p.expectedDate)} · ${p.scheduleName} · ${formatMoney(p.expectedCents)}`}
                  </option>
                ))}
              </select>
            </div>
            {problem !== null && (
              <p role="alert" className="error">
                {problem}
              </p>
            )}
            <ReceivedForm
              // A new form for each paycheck, which leaves the focus where it is.
              key={pay.id}
              autoFocus={false}
              pay={pay}
              saving={saving}
              onProblem={onProblem}
              onCancel={onClose}
              onSave={async (value) => {
                const saved = await onSave({
                  type: 'paycheck',
                  name: `${pay.scheduleName} paycheck`,
                  amountCents: value.receivedCents,
                  // A paycheck belongs to the month it was expected in.
                  date: pay.expectedDate,
                  save: () => client.markPaycheckReceived.mutate({ id: pay.id, ...value }),
                  undo: () => () => client.unmarkPaycheckReceived.mutate({ id: pay.id }),
                });
                if (saved) setMarked({ from: loaded, ids: [...hidden, pay.id] });
              }}
            />
            <Preview text={quickAddPreviewText('paycheck', pay.expectedDate)} />
          </>
        );
      }}
    </Loaded>
  );
}

export function CardPanel(props: PanelProps) {
  const { quickAdd, saving, problem, onProblem, onSave, onClose, onGo } = props;
  const { client } = quickAdd;
  const lists = useLists(() => client.billsPage.query({}));
  const [picked, setPicked] = useState<string | null>(null);

  return (
    <Loaded lists={lists}>
      {(data) => {
        if (data.status === 'closed') {
          return <p>{monthName(data.ym)} is closed, so its card balances can’t be changed.</p>;
        }
        // The chosen card, else the first still to be entered, else the first.
        const card =
          data.cards.find((c) => c.cardId === picked) ??
          data.cards.find((c) => c.statement === null) ??
          data.cards[0];
        if (card === undefined) {
          return (
            <p>
              No credit cards yet.{' '}
              <a
                href="/bills"
                onClick={(event) => {
                  event.preventDefault();
                  onGo('bills');
                }}
              >
                Add one on Bills & cash flow
              </a>
            </p>
          );
        }
        return (
          <>
            <CardStatementForm
              // A new form when the card or what is saved for it changes.
              key={`${card.cardId} ${JSON.stringify(card.statement)}`}
              card={card}
              cards={data.cards}
              ym={data.ym}
              saving={saving}
              problem={problem}
              onProblem={onProblem}
              onPick={(cardId) => {
                onProblem(null);
                setPicked(cardId);
              }}
              onCancel={onClose}
              onSave={(input) =>
                void onSave({
                  type: 'card',
                  name: `${card.nickname} balance`,
                  amountCents: input.plannedPaymentCents,
                  date: card.dueDate,
                  save: () => client.saveCardStatement.mutate(input),
                }).then((saved) => {
                  // Stay on this card, to show what is now saved.
                  if (saved) setPicked(card.cardId);
                })
              }
            />
            <Preview text={quickAddPreviewText('card', card.dueDate)} />
          </>
        );
      }}
    </Loaded>
  );
}
