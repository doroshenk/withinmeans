import {
  formatMoney,
  formatMonthDay,
  monthLabel,
  monthName,
  otherIncomeForMonth,
  paycheckMonthSummary,
  type OtherIncomeItem,
  type OtherIncomeType,
  type RecentSource,
} from '@withinmeans/domain';
import { useCallback, useEffect, useRef, useState } from 'react';
import { GENERIC_ERROR, apiErrorMessage } from '../auth/errors';
import { useCan } from '../permissions';
import { MonthNavigator } from '../shell/MonthNavigator';
import { OtherIncomeForm } from './income/OtherIncomeForm';
import { OtherIncomeList } from './income/OtherIncomeList';
import { EmptyPaychecks } from './paychecks/EmptyPaychecks';
import { PaycheckList } from './paychecks/PaycheckList';
import { ScheduleForm } from './paychecks/ScheduleForm';
import { ScheduleList } from './paychecks/ScheduleList';
import { SummaryTiles } from './paychecks/SummaryTiles';
import type { PaychecksData, PaychecksPageClient, ScheduleInput } from './paychecks/types';

export interface OtherIncomeData {
  /** "YYYY-MM-DD" in the household's time zone. */
  today: string;
  /** The month listed. */
  ym: string;
  entries: (OtherIncomeItem & { accountName: string | null })[];
  recent: RecentSource[];
  accounts: { id: string; name: string; isPrimary: boolean }[];
}

export interface OtherIncomeInput {
  date: string;
  source: string;
  type: OtherIncomeType;
  amountCents: number;
  accountId?: string;
  note?: string;
}

export interface OtherIncomeClient {
  otherIncome: { query: (input: { ym?: string }) => Promise<OtherIncomeData> };
  addOtherIncome: { mutate: (input: OtherIncomeInput) => Promise<unknown> };
  removeOtherIncome: { mutate: (input: { id: string }) => Promise<unknown> };
}

const RELOAD_ERROR = 'Saved, but this page couldn’t refresh. Reload it before trying again.';

type Load =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; page: PaychecksData; income: OtherIncomeData };

/** Where on the page a problem belongs. */
type Section =
  'month' | 'paychecks' | 'schedules' | 'schedule-form' | 'income-form' | 'income-list';

/** The open schedule form: a new schedule, or the id of the one being edited. */
type Editing = { kind: 'add' } | { kind: 'edit'; id: string } | null;

/** Spec §6.4: a month's paychecks and one-time income, and the paycheck schedules. */
export function PaychecksPage({ client }: { client: PaychecksPageClient }) {
  const can = useCan();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<{ section: Section; text: string } | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [addingFirstIncome, setAddingFirstIncome] = useState(false);
  const [saving, setSaving] = useState(false);
  const sourceRef = useRef<HTMLInputElement>(null);
  /** The month asked for; undefined means the household's current one. */
  const asked = useRef<string | undefined>(undefined);

  const fetchAll = useCallback(
    async (ym: string | undefined) => {
      const input = ym === undefined ? {} : { ym };
      const [page, income] = await Promise.all([
        client.paychecksPage.query(input),
        client.otherIncome.query(input),
      ]);
      return { kind: 'ready' as const, page, income };
    },
    [client],
  );

  useEffect(() => {
    let cancelled = false;
    fetchAll(undefined).then(
      (result) => !cancelled && setLoad(result),
      () => !cancelled && setLoad({ kind: 'error' }),
    );
    return () => {
      cancelled = true;
    };
  }, [fetchAll]);

  // The empty page's "Add one-time income" opens the form, ready to type.
  useEffect(() => {
    if (addingFirstIncome) sourceRef.current?.focus();
  }, [addingFirstIncome]);

  const report = (section: Section) => (text: string | null) =>
    setProblem(text === null ? null : { section, text });
  const problemIn = (section: Section) => (problem?.section === section ? problem.text : null);

  const showMonth = async (ym: string) => {
    asked.current = ym;
    setNotice(null);
    setProblem(null);
    try {
      const result = await fetchAll(ym);
      // A later click wins.
      if (asked.current === ym) setLoad(result);
    } catch {
      if (asked.current === ym) report('month')(GENERIC_ERROR);
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
    await fetchAll(asked.current).then(setLoad, () => report(section)(RELOAD_ERROR));
    setSaving(false);
    return true;
  };

  if (load.kind !== 'ready') {
    return (
      <main className="page">
        <header className="page-head">
          <div>
            <p className="page-kicker">Paychecks &amp; other income</p>
            <h1>Paychecks &amp; income</h1>
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

  const { page, income } = load;
  const entries = otherIncomeForMonth(income.entries, page.ym);
  const isEmpty =
    page.schedules.length === 0 &&
    page.paychecks.length === 0 &&
    entries.length === 0 &&
    income.recent.length === 0;

  const openSchedule = (next: Editing) => {
    setNotice(null);
    setProblem(null);
    setEditing(next);
  };
  const edited =
    editing?.kind === 'edit' ? page.schedules.find((s) => s.id === editing.id) : undefined;

  const saveSchedule = async (input: ScheduleInput) => {
    const saved = await act(
      () =>
        edited
          ? client.updatePaySchedule.mutate({ ...input, id: edited.id })
          : client.addPaySchedule.mutate(input),
      'schedule-form',
      `Saved ${input.name}.`,
    );
    if (saved) setEditing(null);
  };

  const scheduleForm = can.write && (editing?.kind === 'add' || edited !== undefined) && (
    <ScheduleForm
      key={edited?.id ?? 'new'}
      schedule={edited}
      today={page.today}
      accounts={page.accounts}
      saving={saving}
      problem={problemIn('schedule-form')}
      onProblem={report('schedule-form')}
      onSave={(input) => void saveSchedule(input)}
      onCancel={() => openSchedule(null)}
      onStop={() => {
        if (!edited) return;
        void act(
          () => client.stopPaySchedule.mutate({ id: edited.id }),
          'schedule-form',
          `Stopped ${edited.name}.`,
        ).then((stopped) => stopped && setEditing(null));
      }}
    />
  );

  const incomeForm = can.write && (
    <OtherIncomeForm
      sourceRef={sourceRef}
      today={income.today}
      accounts={income.accounts}
      recent={income.recent}
      saving={saving}
      problem={problemIn('income-form')}
      onProblem={report('income-form')}
      onSave={(input) =>
        act(
          () => client.addOtherIncome.mutate(input),
          'income-form',
          `Added ${formatMoney(input.amountCents)} to ${monthLabel(input.date.slice(0, 7))}.`,
        )
      }
    />
  );

  return (
    <main className="page">
      <header className="page-head">
        <div>
          <p className="page-kicker">Paychecks &amp; other income</p>
          <MonthNavigator
            month={page.ym}
            status={page.status}
            headingLevel={1}
            onChange={(ym) => void showMonth(ym)}
          />
        </div>
        {can.write && !isEmpty && (
          <div className="form-actions">
            <button
              type="button"
              className="button button-quiet"
              onClick={() => openSchedule({ kind: 'add' })}
            >
              Set up a paycheck
            </button>
            <button type="button" className="button" onClick={() => sourceRef.current?.focus()}>
              Add one-time income
            </button>
          </div>
        )}
      </header>
      {problemIn('month') !== null && (
        <p role="alert" className="error">
          {problemIn('month')}
        </p>
      )}
      {notice !== null && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {isEmpty ? (
        <>
          <EmptyPaychecks
            onSetUp={() => openSchedule({ kind: 'add' })}
            onAddIncome={() => setAddingFirstIncome(true)}
          />
          {scheduleForm}
          {addingFirstIncome && incomeForm}
        </>
      ) : (
        <>
          <SummaryTiles summary={paycheckMonthSummary(page.paychecks, entries)} />
          <div className="paycheck-columns">
            <PaycheckList
              key={page.ym}
              data={page}
              saving={saving}
              problem={problemIn('paychecks')}
              onProblem={report('paychecks')}
              onReceived={(pay, received) =>
                act(
                  () => client.markPaycheckReceived.mutate(received),
                  'paychecks',
                  `Marked ${formatMonthDay(pay.expectedDate)} received at ${formatMoney(received.receivedCents)}.`,
                )
              }
              onUndo={(id) =>
                void act(() => client.unmarkPaycheckReceived.mutate({ id }), 'paychecks')
              }
            />
            <ScheduleList
              today={page.today}
              schedules={page.schedules}
              saving={saving}
              problem={problemIn('schedules')}
              onAdd={() => openSchedule({ kind: 'add' })}
              onEdit={(id) => openSchedule({ kind: 'edit', id })}
              onRestart={(schedule) =>
                void act(
                  () => client.restartPaySchedule.mutate({ id: schedule.id }),
                  'schedules',
                  `Restarted ${schedule.name}.`,
                )
              }
            />
          </div>
          {scheduleForm}
          <div className={can.write ? 'income-columns' : undefined}>
            {incomeForm}
            <OtherIncomeList
              month={monthName(page.ym)}
              entries={entries}
              saving={saving}
              readOnly={page.status === 'closed'}
              problem={problemIn('income-list')}
              onRemove={(id) =>
                void act(() => client.removeOtherIncome.mutate({ id }), 'income-list')
              }
            />
          </div>
        </>
      )}
    </main>
  );
}
