import { formatMoney, recurringOverview, type RecurringBillItem } from '@withinmeans/domain';
import { useCallback, useEffect, useState } from 'react';
import { GENERIC_ERROR, apiErrorMessage } from '../auth/errors';
import { useCan } from '../permissions';
import type { CategoriesClient, CategoryRow } from './CategoriesStep';
import { BillForm } from './recurring/BillForm';
import { BillTable } from './recurring/BillTable';
import { CategoryManager } from './recurring/CategoryManager';
import { SummaryTiles, WeeksCard } from './recurring/Summary';
import type { RecurringBillsClient } from './RecurringBillsStep';

export interface RecurringData {
  /** "YYYY-MM-DD" in the household's time zone. */
  today: string;
  bills: RecurringBillItem[];
  /** Categories that any bill, past ones too, uses: deleting one asks where they move. */
  usedCategoryIds: string[];
  /** Monthly take-home pay; null until pay schedules exist. */
  takeHomeCents: number | null;
}

export interface BillInput {
  name: string;
  estimateCents: number;
  dueDay: number;
  categoryId: string;
  autopay: boolean;
}

type ById = { mutate: (input: { id: string }) => Promise<unknown> };

export interface RecurringClient
  extends
    Pick<
      CategoriesClient,
      'categories' | 'createCategory' | 'renameCategory' | 'recolorCategory' | 'deleteCategory'
    >,
    Pick<RecurringBillsClient, 'addRecurringBill' | 'removeRecurringBill'> {
  recurringBills: { query: () => Promise<RecurringData> };
  updateRecurringBill: { mutate: (input: BillInput & { id: string }) => Promise<unknown> };
  endRecurringBill: ById;
  restartRecurringBill: ById;
}

type Load =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; data: RecurringData; categories: CategoryRow[] };

/** The open bill form: a new bill, or the id of the one being edited. */
type Editing = { kind: 'add' } | { kind: 'edit'; id: string } | null;

/** Spec §6.3: the bill list, the add and edit forms, ending and restarting, and categories. */
export function RecurringPage({ client }: { client: RecurringClient }) {
  const can = useCan();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [editing, setEditing] = useState<Editing>(null);
  const [managing, setManaging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [categoryProblem, setCategoryProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    const [data, categories] = await Promise.all([
      client.recurringBills.query(),
      client.categories.query(),
    ]);
    return { kind: 'ready' as const, data, categories };
  }, [client]);

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
    report: (problem: string) => void = setProblem,
  ): Promise<boolean> => {
    if (saving) return false;
    setSaving(true);
    setProblem(null);
    setCategoryProblem(null);
    setNotice(null);
    try {
      const message = await change();
      setLoad(await fetchAll());
      if (typeof message === 'string') setNotice(message);
      return true;
    } catch (error) {
      report(apiErrorMessage(error));
      // Part of the change may have been saved. If this reload fails too, keep what is shown.
      await fetchAll().then(setLoad, () => {});
      return false;
    } finally {
      setSaving(false);
    }
  };

  /** A change made from the bill form, which closes when it works. */
  const fromForm = async (change: () => Promise<unknown>) => {
    if (await act(change)) setEditing(null);
  };

  const show = (next: Editing) => {
    setProblem(null);
    setNotice(null);
    setEditing(next);
  };

  const header = (
    <header className="page-head">
      <div>
        <p className="page-kicker">Bills</p>
        <h1>Recurring bills</h1>
        <p>
          The bills that show up every month. Each new month, they&apos;re added to Bills &amp; cash
          flow on their due date, using the estimated amount until you enter the real one.
        </p>
      </div>
      {load.kind === 'ready' && load.data.bills.length > 0 && can.write && (
        <button type="button" className="button" onClick={() => show({ kind: 'add' })}>
          Add recurring bill
        </button>
      )}
    </header>
  );

  if (load.kind !== 'ready') {
    return (
      <main className="page">
        {header}
        {load.kind === 'loading' ? (
          <p role="status">Loading…</p>
        ) : (
          <p role="alert">{GENERIC_ERROR}</p>
        )}
      </main>
    );
  }

  const { data, categories } = load;
  const overview = recurringOverview(data.bills, data.today);
  const edited = editing?.kind === 'edit' ? data.bills.find((b) => b.id === editing.id) : undefined;
  const formOpen = editing?.kind === 'add' || edited !== undefined;

  return (
    <main className="page">
      {header}
      {problem !== null && (
        <p role="alert" className="error">
          {problem}
        </p>
      )}

      {can.write && formOpen && (
        <BillForm
          // A new form for each bill, so it starts from that bill's values.
          key={edited?.id ?? 'new'}
          {...(edited && { bill: edited })}
          categories={categories}
          saving={saving}
          onProblem={setProblem}
          onCancel={() => show(null)}
          onSave={(input) =>
            void fromForm(() =>
              edited
                ? client.updateRecurringBill.mutate({ id: edited.id, ...input })
                : client.addRecurringBill.mutate(input),
            )
          }
          onEnd={() =>
            void fromForm(async () => {
              if (edited) await client.endRecurringBill.mutate({ id: edited.id });
            })
          }
          onDelete={() =>
            void fromForm(async () => {
              if (edited) await client.removeRecurringBill.mutate({ id: edited.id });
            })
          }
        />
      )}

      {data.bills.length === 0 ? (
        <>
          <section className="card empty-state">
            <span className="empty-icon" data-testid="empty-icon" aria-hidden="true">
              ⟳
            </span>
            <h2>No recurring bills yet</h2>
            <p>
              {can.write
                ? 'Add the bills that come every month, like rent or electric.'
                : 'The owner or a full member will set them up.'}
            </p>
            {can.write && (
              <div className="form-actions">
                <button type="button" className="button" onClick={() => show({ kind: 'add' })}>
                  Add your first bill
                </button>
                <button
                  type="button"
                  className="button button-quiet"
                  onClick={() => setManaging(true)}
                >
                  Manage categories
                </button>
              </div>
            )}
          </section>
          <div className="empty-preview" data-testid="recurring-preview">
            {['Estimated each month', 'Week 1', 'Next up'].map((label) => (
              <div key={label} className="tile">
                <p className="tile-label">{label}</p>
                <p className="tile-value">{formatMoney(0)}</p>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <SummaryTiles overview={overview} takeHomeCents={data.takeHomeCents} />
          <WeeksCard overview={overview} />
        </>
      )}

      {can.write && managing && (
        <CategoryManager
          client={client}
          categories={categories}
          bills={data.bills}
          usedCategoryIds={data.usedCategoryIds}
          act={(change) => act(change, setCategoryProblem)}
          onProblem={setCategoryProblem}
          problem={categoryProblem}
          notice={notice}
          onDone={() => {
            setManaging(false);
            setCategoryProblem(null);
            setNotice(null);
          }}
        />
      )}

      {data.bills.length > 0 && (
        <BillTable
          bills={overview.active}
          categories={categories}
          onEdit={(bill) => show({ kind: 'edit', id: bill.id })}
          onManageCategories={() => setManaging(true)}
        />
      )}

      {overview.ended.length > 0 && (
        <section className="card">
          <h2>Ended bills</h2>
          <p className="help">Months that already have these keep them.</p>
          <ul className="ended-list" aria-label="Ended bills">
            {overview.ended.map((bill) => (
              <li key={bill.id}>
                <strong>{bill.name}</strong>
                <span>{formatMoney(bill.estimateCents)}</span>
                {can.write && (
                  <button
                    type="button"
                    className="button button-quiet"
                    aria-label={`Restart ${bill.name}`}
                    disabled={saving}
                    onClick={() =>
                      void act(async () => {
                        await client.restartRecurringBill.mutate({ id: bill.id });
                      })
                    }
                  >
                    Restart
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
