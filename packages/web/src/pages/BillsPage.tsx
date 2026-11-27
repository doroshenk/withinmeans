import {
  billAddedText,
  billCategoryTotals,
  billsMonthSummary,
  billWeeks,
  cardCashflow,
  monthName,
  type CardRow,
} from '@withinmeans/domain';
import { useCallback, useEffect, useRef, useState } from 'react';
import { GENERIC_ERROR, apiErrorMessage } from '../auth/errors';
import { useCan } from '../permissions';
import { MonthNavigator } from '../shell/MonthNavigator';
import { useSavedByQuickAdd } from '../shell/quickAdd/context';
import type { Route } from '../shell/Shell';
import { BillTiles } from './bills/BillTiles';
import { CardsCard } from './bills/CardsCard';
import { CardStatementForm } from './bills/CardStatementForm';
import { EmptyBills } from './bills/EmptyBills';
import { OneTimeBillForm } from './bills/OneTimeBillForm';
import { AddsUpCard, CategoryCard, PaychecksCard } from './bills/SideCards';
import type { BillFields, BillsData, BillsPageClient, BillsPageRow } from './bills/types';
import { WeeksCard } from './bills/WeeksCard';
import { CardForm } from './cards/CardForm';
import type { NewCardInput, StatementInput } from './cards/types';

export interface BillsPageProps {
  client: BillsPageClient;
  onNavigate?: (route: Route) => void;
  /** The month to open on ("YYYY-MM"); this month when not given. */
  initialYm?: string;
}

const RELOAD_ERROR = 'Saved, but this page couldn’t refresh. Reload it before trying again.';

type Load = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; data: BillsData };

/** Where on the page a problem belongs. */
type Section = 'page' | 'bills' | 'cards' | 'form';

/** The open form: a new bill, the bill being edited, a card's balance or a new card. */
type Editing =
  | { kind: 'add' }
  | { kind: 'edit'; id: string }
  | { kind: 'balance'; cardId: string }
  | { kind: 'card' }
  | null;

/** Spec §6.2: a month's bills week by week, with the paychecks and how the month adds up. */
export function BillsPage({ client, onNavigate = () => {}, initialYm }: BillsPageProps) {
  const can = useCan();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<{ section: Section; text: string } | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [saving, setSaving] = useState(false);
  /** The month asked for; undefined means the household's current one. */
  const asked = useRef(initialYm);
  /** Counts the page's reloads, so that only the latest one's answer is shown. */
  const latest = useRef(0);
  /** The form open right now, for a save that ends after the user has moved on. */
  const openForm = useRef<Editing>(null);

  const fetchMonth = useCallback(
    (ym: string | undefined) => client.billsPage.query(ym === undefined ? {} : { ym }),
    [client],
  );

  useEffect(() => {
    let cancelled = false;
    fetchMonth(initialYm).then(
      (data) => !cancelled && setLoad({ kind: 'ready', data }),
      () => !cancelled && setLoad({ kind: 'error' }),
    );
    return () => {
      cancelled = true;
    };
  }, [fetchMonth, initialYm]);

  const report = (section: Section) => (text: string | null) =>
    setProblem(text === null ? null : { section, text });
  const problemIn = (section: Section) => (problem?.section === section ? problem.text : null);

  /** Loads the month asked for; an answer overtaken by a later reload is dropped. */
  const reload = async (onFailure: () => void) => {
    const mine = ++latest.current;
    try {
      const data = await fetchMonth(asked.current);
      if (latest.current === mine) setLoad({ kind: 'ready', data });
    } catch {
      if (latest.current === mine) onFailure();
    }
  };

  /** Runs one change, then shows what the server now has. */
  const act = async (
    change: () => Promise<unknown>,
    failed: (message: string) => void,
    done?: string,
  ): Promise<boolean> => {
    if (saving) return false;
    setSaving(true);
    setNotice(null);
    setProblem(null);
    try {
      await change();
    } catch (error) {
      failed(apiErrorMessage(error));
      setSaving(false);
      return false;
    }
    if (done !== undefined) setNotice(done);
    // The change is saved. If this reload fails, keep what is shown.
    await reload(() => report('page')(RELOAD_ERROR));
    setSaving(false);
    return true;
  };

  useSavedByQuickAdd(() => void reload(() => report('page')(RELOAD_ERROR)));

  if (load.kind !== 'ready') {
    return (
      <main className="page">
        <header className="page-head">
          <div>
            <p className="page-kicker">Bills &amp; cash flow</p>
            <h1>Bills &amp; cash flow</h1>
          </div>
        </header>
        {load.kind === 'loading' ? (
          <p role="status">Loading…</p>
        ) : (
          <p role="alert">{GENERIC_ERROR}</p>
        )}
      </main>
    );
  }

  const { data } = load;
  const month = monthName(data.ym);
  const changeable = can.write && data.status !== 'closed';
  const canOpen = can.write && data.status === 'not-started' && data.canOpen;
  const isEmpty = data.bills.length === 0;
  const hasIncome = data.paychecks.length > 0 || data.otherIncome.length > 0;
  // Nothing moves to checking until Phase 3.
  const summary = billsMonthSummary({ ...data, cards: cardCashflow(data.cards) });
  const hasCards = data.cards.length > 0;
  /** Anything to add up: without it the page shows its empty state and preview. */
  const hasAmounts = !isEmpty || hasIncome || data.cards.some((c) => c.statement !== null);

  const setForm = (next: Editing) => {
    openForm.current = next;
    setEditing(next);
  };

  const show = (next: Editing) => {
    setNotice(null);
    setProblem(null);
    setForm(next);
  };

  const showMonth = async (ym: string) => {
    const shown = data.ym;
    asked.current = ym;
    show(null);
    await reload(() => {
      asked.current = shown;
      report('page')(GENERIC_ERROR);
    });
  };

  const openMonth = () =>
    void act(() => client.openMonth.mutate({ ym: data.ym }), report('page'), `${month} is open.`);

  const edited = editing?.kind === 'edit' ? data.bills.find((b) => b.id === editing.id) : undefined;

  const save = async (fields: BillFields, paid: boolean) => {
    const form = openForm.current;
    const saved = await act(
      () =>
        edited?.id
          ? client.updateBill.mutate({ ...fields, id: edited.id })
          : client.addBill.mutate({ ...fields, paid }),
      // The page says so if the form that was saved is no longer the one open.
      (message) =>
        openForm.current === form
          ? report('form')(message)
          : report('page')(`${fields.name} wasn’t saved. ${message}`),
      edited ? `Saved ${fields.name}.` : billAddedText(fields.name, fields.dueDate),
    );
    // Closes the form that was saved, unless another has been opened since.
    if (saved && openForm.current === form) setForm(null);
  };

  /** Saves from a card form, which closes when it works. */
  const saveForm = async (save: () => Promise<unknown>, what: string, done: string) => {
    const form = openForm.current;
    const saved = await act(
      save,
      // The page says so if the form that was saved is no longer the one open.
      (message) =>
        openForm.current === form
          ? report('form')(message)
          : report('page')(`${what} wasn’t saved. ${message}`),
      done,
    );
    if (saved && openForm.current === form) setForm(null);
    return saved;
  };

  const balanceCard =
    editing?.kind === 'balance' ? data.cards.find((c) => c.cardId === editing.cardId) : undefined;
  const enterBalance = (card: CardRow | undefined) => {
    if (card) show({ kind: 'balance', cardId: card.cardId });
  };
  const saveStatement = (card: CardRow, input: StatementInput) =>
    void saveForm(
      () => client.saveCardStatement.mutate(input),
      `The ${card.nickname} balance`,
      `Saved the ${card.nickname} balance.`,
    );
  const addCard = (input: NewCardInput) =>
    saveForm(() => client.addCreditCard.mutate(input), input.nickname, `Added ${input.nickname}.`);

  const change = (bill: BillsPageRow, run: (id: string) => Promise<unknown>, done?: string) => {
    const { id } = bill;
    if (id !== null) void act(() => run(id), report('bills'), done);
  };

  return (
    <main className="page">
      <header className="page-head">
        <div>
          <p className="page-kicker">Bills &amp; cash flow</p>
          <MonthNavigator
            month={data.ym}
            status={data.status}
            headingLevel={1}
            onChange={(ym) => void showMonth(ym)}
          />
        </div>
        {changeable && (!isEmpty || hasCards) && (
          <div className="form-actions">
            {!isEmpty && canOpen && (
              <button type="button" className="button" disabled={saving} onClick={openMonth}>
                Open {month}
              </button>
            )}
            {hasCards && (
              <button
                type="button"
                className="button button-quiet"
                // The first card still to be entered, else the first card.
                onClick={() =>
                  enterBalance(data.cards.find((c) => c.statement === null) ?? data.cards[0])
                }
              >
                Add card balance
              </button>
            )}
            {!isEmpty && (
              <button
                type="button"
                className={canOpen ? 'button button-quiet' : 'button'}
                onClick={() => show({ kind: 'add' })}
              >
                Add one-time bill
              </button>
            )}
          </div>
        )}
      </header>
      {problemIn('page') !== null && (
        <p role="alert" className="error">
          {problemIn('page')}
        </p>
      )}
      {notice !== null && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {data.status === 'closed' && (
        <p className="help">{month} is closed, so its bills can’t be changed.</p>
      )}
      {data.status === 'not-started' && !isEmpty && (
        <p className="help">
          A preview from your recurring bills and paychecks. {month} isn’t started yet.
        </p>
      )}
      {hasAmounts && <BillTiles summary={summary} />}
      {changeable && (editing?.kind === 'add' || edited !== undefined) && (
        <OneTimeBillForm
          // A new form for each bill, so it starts from that bill's values.
          key={edited?.id ?? 'new'}
          bill={edited}
          ym={data.ym}
          today={data.today}
          categories={data.categories}
          saving={saving}
          problem={problemIn('form')}
          onProblem={report('form')}
          onCancel={() => show(null)}
          onSave={(fields, paid) => void save(fields, paid)}
        />
      )}
      {changeable && balanceCard && (
        <CardStatementForm
          // A new form for each card, and when its saved values change (from Quick Add).
          key={`${balanceCard.cardId} ${JSON.stringify(balanceCard.statement)}`}
          card={balanceCard}
          cards={data.cards}
          ym={data.ym}
          saving={saving}
          problem={problemIn('form')}
          onProblem={report('form')}
          onPick={(cardId) => show({ kind: 'balance', cardId })}
          onCancel={() => show(null)}
          onSave={(input) => saveStatement(balanceCard, input)}
        />
      )}
      {changeable && editing?.kind === 'card' && (
        <section className="card bill-entry">
          <h2>Add a card</h2>
          <CardForm
            saving={saving}
            problem={problemIn('form')}
            onProblem={report('form')}
            onSave={addCard}
            onCancel={() => show(null)}
          />
        </section>
      )}
      {isEmpty && (
        <EmptyBills
          month={month}
          canWrite={changeable}
          saving={saving}
          showPreview={!hasAmounts}
          onOpen={canOpen ? openMonth : undefined}
          onAdd={() => show({ kind: 'add' })}
          onRecurring={() => onNavigate('recurring')}
        />
      )}
      {(hasAmounts || hasCards) && (
        <div className={isEmpty ? 'bill-side bill-side-wide' : 'bill-columns'}>
          {!isEmpty && (
            <WeeksCard
              // The open weeks start again for each month.
              key={data.ym}
              month={month}
              weeks={billWeeks(data.bills, data.ym, data.today)}
              paidCount={summary.paidCount}
              billCount={summary.billCount}
              categories={data.categories}
              changeable={changeable}
              saving={saving}
              problem={problemIn('bills')}
              onPaid={(bill, paid) => change(bill, (id) => client.setBillPaid.mutate({ id, paid }))}
              onEdit={(bill) => bill.id !== null && show({ kind: 'edit', id: bill.id })}
              onDelete={(bill) =>
                change(bill, (id) => client.removeBill.mutate({ id }), `Deleted ${bill.name}.`)
              }
              onRecurring={() => onNavigate('recurring')}
            />
          )}
          <div className={isEmpty ? 'bill-columns-even' : 'bill-side'}>
            {(!isEmpty || summary.cardsCents > 0) && (
              <CategoryCard
                totals={billCategoryTotals(data.bills, data.categories, summary.cardsCents)}
              />
            )}
            <CardsCard
              // A half-typed payment belongs to one month.
              key={data.ym}
              month={month}
              ym={data.ym}
              cards={data.cards}
              totalCents={summary.cardsCents}
              changeable={changeable}
              saving={saving}
              problem={problemIn('cards')}
              onProblem={report('cards')}
              onEnter={enterBalance}
              onPaid={(card, paidCents) =>
                act(
                  () => client.markCardPaid.mutate({ cardId: card.cardId, ym: data.ym, paidCents }),
                  report('cards'),
                  `Marked ${card.nickname} paid.`,
                )
              }
              onUndo={(card) =>
                void act(
                  () => client.unmarkCardPaid.mutate({ cardId: card.cardId, ym: data.ym }),
                  report('cards'),
                )
              }
              onAddCard={() => show({ kind: 'card' })}
            />
            {hasAmounts && (
              <PaychecksCard
                month={month}
                today={data.today}
                paychecks={data.paychecks}
                otherIncome={data.otherIncome}
                otherCents={summary.otherCents}
                onManage={() => onNavigate('paychecks')}
              />
            )}
            {hasAmounts && <AddsUpCard month={month} summary={summary} />}
          </div>
        </div>
      )}
    </main>
  );
}
