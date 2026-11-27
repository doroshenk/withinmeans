import {
  billAddedText,
  billCategoryTotals,
  billsMonthSummary,
  billWeeks,
  monthName,
} from '@withinmeans/domain';
import { useCallback, useEffect, useRef, useState } from 'react';
import { GENERIC_ERROR, apiErrorMessage } from '../auth/errors';
import { useCan } from '../permissions';
import { MonthNavigator } from '../shell/MonthNavigator';
import type { Route } from '../shell/Shell';
import { BillTiles } from './bills/BillTiles';
import { EmptyBills } from './bills/EmptyBills';
import { OneTimeBillForm } from './bills/OneTimeBillForm';
import { AddsUpCard, CategoryCard, PaychecksCard } from './bills/SideCards';
import type { BillFields, BillsData, BillsPageClient, BillsPageRow } from './bills/types';
import { WeeksCard } from './bills/WeeksCard';

export interface BillsPageProps {
  client: BillsPageClient;
  onNavigate?: (route: Route) => void;
}

const RELOAD_ERROR = 'Saved, but this page couldn’t refresh. Reload it before trying again.';

type Load = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; data: BillsData };

/** Where on the page a problem belongs. */
type Section = 'page' | 'bills' | 'form';

/** The open form: a new bill, or the id of the one being edited. */
type Editing = { kind: 'add' } | { kind: 'edit'; id: string } | null;

/** Spec §6.2: a month's bills week by week, with the paychecks and how the month adds up. */
export function BillsPage({ client, onNavigate = () => {} }: BillsPageProps) {
  const can = useCan();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<{ section: Section; text: string } | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [saving, setSaving] = useState(false);
  /** The month asked for; undefined means the household's current one. */
  const asked = useRef<string | undefined>(undefined);
  /** Counts the page's reloads, so that only the latest one's answer is shown. */
  const latest = useRef(0);

  const fetchMonth = useCallback(
    (ym: string | undefined) => client.billsPage.query(ym === undefined ? {} : { ym }),
    [client],
  );

  useEffect(() => {
    let cancelled = false;
    fetchMonth(undefined).then(
      (data) => !cancelled && setLoad({ kind: 'ready', data }),
      () => !cancelled && setLoad({ kind: 'error' }),
    );
    return () => {
      cancelled = true;
    };
  }, [fetchMonth]);

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
    section: Section,
    done?: string,
  ): Promise<boolean> => {
    if (saving) return false;
    setSaving(true);
    setNotice(null);
    setProblem(null);
    try {
      await change();
    } catch (error) {
      report(section)(apiErrorMessage(error));
      setSaving(false);
      return false;
    }
    if (done !== undefined) setNotice(done);
    // The change is saved. If this reload fails, keep what is shown.
    await reload(() => report('page')(RELOAD_ERROR));
    setSaving(false);
    return true;
  };

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
  // No cards until P2-07, and nothing moved to checking until Phase 3.
  const summary = billsMonthSummary({ ...data, cards: [] });

  const show = (next: Editing) => {
    setNotice(null);
    setProblem(null);
    setEditing(next);
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
    void act(() => client.openMonth.mutate({ ym: data.ym }), 'page', `${month} is open.`);

  const edited = editing?.kind === 'edit' ? data.bills.find((b) => b.id === editing.id) : undefined;

  const save = async (fields: BillFields, paid: boolean) => {
    const form = editing;
    const saved = await act(
      () =>
        edited?.id
          ? client.updateBill.mutate({ ...fields, id: edited.id })
          : client.addBill.mutate({ ...fields, paid }),
      'form',
      edited ? `Saved ${fields.name}.` : billAddedText(fields.name, fields.dueDate),
    );
    // Closes the form that was saved, unless another has been opened since.
    if (saved) setEditing((current) => (current === form ? null : current));
  };

  const change = (bill: BillsPageRow, run: (id: string) => Promise<unknown>, done?: string) => {
    const { id } = bill;
    if (id !== null) void act(() => run(id), 'bills', done);
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
        {!isEmpty && changeable && (
          <div className="form-actions">
            {canOpen && (
              <button type="button" className="button" disabled={saving} onClick={openMonth}>
                Open {month}
              </button>
            )}
            <button
              type="button"
              className={canOpen ? 'button button-quiet' : 'button'}
              onClick={() => show({ kind: 'add' })}
            >
              Add one-time bill
            </button>
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
      {(!isEmpty || hasIncome) && <BillTiles summary={summary} />}
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
      {isEmpty && (
        <EmptyBills
          month={month}
          canWrite={changeable}
          saving={saving}
          showPreview={!hasIncome}
          onOpen={canOpen ? openMonth : undefined}
          onAdd={() => show({ kind: 'add' })}
          onRecurring={() => onNavigate('recurring')}
        />
      )}
      {(!isEmpty || hasIncome) && (
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
            {!isEmpty && (
              <CategoryCard
                totals={billCategoryTotals(data.bills, data.categories, summary.cardsCents)}
              />
            )}
            <PaychecksCard
              month={month}
              today={data.today}
              paychecks={data.paychecks}
              otherIncome={data.otherIncome}
              otherCents={summary.otherCents}
              onManage={() => onNavigate('paychecks')}
            />
            <AddsUpCard month={month} summary={summary} />
          </div>
        </div>
      )}
    </main>
  );
}
