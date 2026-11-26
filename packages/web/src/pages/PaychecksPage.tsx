import {
  formatMoney,
  monthLabel,
  monthName,
  otherIncomeForMonth,
  type OtherIncomeItem,
  type OtherIncomeType,
  type RecentSource,
} from '@withinmeans/domain';
import { useCallback, useEffect, useRef, useState } from 'react';
import { GENERIC_ERROR, apiErrorMessage } from '../auth/errors';
import { useCan } from '../permissions';
import { OtherIncomeForm } from './income/OtherIncomeForm';
import { OtherIncomeList } from './income/OtherIncomeList';

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

type Load = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; data: OtherIncomeData };

/** Spec §6.4. One-time income for now; P2-09 adds the paychecks, schedules and month navigator. */
export function PaychecksPage({ client }: { client: OtherIncomeClient }) {
  const can = useCan();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [notice, setNotice] = useState<string | null>(null);
  const [formProblem, setFormProblem] = useState<string | null>(null);
  const [listProblem, setListProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const sourceRef = useRef<HTMLInputElement>(null);

  const fetchAll = useCallback(
    async () => ({ kind: 'ready' as const, data: await client.otherIncome.query({}) }),
    [client],
  );

  useEffect(() => {
    let cancelled = false;
    fetchAll().then(
      (result) => !cancelled && setLoad(result),
      () => !cancelled && setLoad({ kind: 'error' }),
    );
    return () => {
      cancelled = true;
    };
  }, [fetchAll]);

  /** Runs one change, then shows what the server now has. */
  const act = async (
    change: () => Promise<unknown>,
    report: (problem: string) => void,
  ): Promise<boolean> => {
    if (saving) return false;
    setSaving(true);
    setNotice(null);
    setFormProblem(null);
    setListProblem(null);
    try {
      await change();
    } catch (error) {
      report(apiErrorMessage(error));
      setSaving(false);
      return false;
    }
    // The change is saved. If this reload fails, keep what is shown.
    await fetchAll().then(setLoad, () => report(RELOAD_ERROR));
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

  const { data } = load;
  const entries = otherIncomeForMonth(data.entries, data.ym);

  return (
    <main className="page">
      <header className="page-head">
        <div>
          <p className="page-kicker">Paychecks &amp; other income</p>
          <h1>{monthLabel(data.ym)}</h1>
        </div>
        {can.write && (
          <button type="button" className="button" onClick={() => sourceRef.current?.focus()}>
            Add one-time income
          </button>
        )}
      </header>
      {notice !== null && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      <div className={can.write ? 'income-columns' : undefined}>
        {can.write && (
          <OtherIncomeForm
            sourceRef={sourceRef}
            today={data.today}
            accounts={data.accounts}
            recent={data.recent}
            saving={saving}
            problem={formProblem}
            onProblem={setFormProblem}
            onSave={async (input) => {
              const saved = await act(() => client.addOtherIncome.mutate(input), setFormProblem);
              if (saved) {
                setNotice(
                  `Added ${formatMoney(input.amountCents)} to ${monthLabel(input.date.slice(0, 7))}.`,
                );
              }
              return saved;
            }}
          />
        )}
        <OtherIncomeList
          month={monthName(data.ym)}
          entries={entries}
          saving={saving}
          problem={listProblem}
          onRemove={(id) => void act(() => client.removeOtherIncome.mutate({ id }), setListProblem)}
        />
      </div>
    </main>
  );
}
