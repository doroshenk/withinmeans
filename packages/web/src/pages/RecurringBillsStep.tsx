import {
  SUGGESTED_BILLS,
  billDraftError,
  dueDayLabel,
  formatMoney,
  isSuggestionUsed,
  parseDollars,
  shareOfTakeHome,
} from '@withinmeans/domain';
import { useCallback, useEffect, useState } from 'react';
import { GENERIC_ERROR, apiErrorMessage } from '../auth/errors';
import { useCan } from '../permissions';
import type { CategoriesClient, CategoryRow } from './CategoriesStep';

export interface BillRow {
  id: string;
  name: string;
  estimateCents: number;
  dueDay: number;
  categoryId: string;
  categoryName: string;
  autopay: boolean;
}

export interface SetupBillsData {
  bills: BillRow[];
  totalCents: number;
  /** Monthly take-home pay; null until paychecks exist. */
  takeHomeCents: number | null;
}

export interface RecurringBillsClient extends Pick<CategoriesClient, 'categories'> {
  setupBills: { query: () => Promise<SetupBillsData> };
  addRecurringBill: {
    mutate: (input: {
      name: string;
      estimateCents: number;
      dueDay: number;
      categoryId: string;
      autopay: boolean;
    }) => Promise<{ id: string }>;
  };
  removeRecurringBill: { mutate: (input: { id: string }) => Promise<unknown> };
}

type Load =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; data: SetupBillsData; categories: CategoryRow[] };

/** Spec §3 step 5: recurring bills (name, estimate, due day 1–28, category, autopay). */
export function RecurringBillsStep({ client }: { client: RecurringBillsClient }) {
  const can = useCan();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [name, setName] = useState('');
  const [estimate, setEstimate] = useState('');
  const [dueDay, setDueDay] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [autopay, setAutopay] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const fetchAll = useCallback(
    async () => ({
      data: await client.setupBills.query(),
      categories: await client.categories.query(),
    }),
    [client],
  );

  const reload = useCallback(async () => {
    setLoad({ kind: 'ready', ...(await fetchAll()) });
  }, [fetchAll]);

  useEffect(() => {
    let cancelled = false;
    fetchAll().then(
      (result) => !cancelled && setLoad({ kind: 'ready', ...result }),
      () => !cancelled && setLoad({ kind: 'error' }),
    );
    return () => {
      cancelled = true;
    };
  }, [fetchAll]);

  if (load.kind === 'loading') return <p role="status">Loading…</p>;
  if (load.kind === 'error') return <p role="alert">{GENERIC_ERROR}</p>;
  const { data, categories } = load;
  const chosenCategory = categories.some((c) => c.id === categoryId)
    ? categoryId
    : (categories[0]?.id ?? '');

  const add = async () => {
    const error = billDraftError({ name, estimateText: estimate, dueDayText: dueDay });
    if (error !== undefined) {
      setProblem(error);
      return;
    }
    setProblem(null);
    try {
      await client.addRecurringBill.mutate({
        name: name.trim(),
        estimateCents: parseDollars(estimate) ?? 0,
        dueDay: Number(dueDay),
        categoryId: chosenCategory,
        autopay,
      });
      setName('');
      setEstimate('');
      setDueDay('');
      setAutopay(false);
      await reload();
    } catch (err) {
      setProblem(apiErrorMessage(err));
    }
  };

  const remove = async (id: string) => {
    setProblem(null);
    try {
      await client.removeRecurringBill.mutate({ id });
      await reload();
    } catch (err) {
      setProblem(apiErrorMessage(err));
    }
  };

  const billNames = data.bills.map((b) => b.name);

  return (
    <div className="bills">
      {data.bills.length === 0 ? (
        <p>
          {can.write
            ? 'No recurring bills yet. Add the ones that come every month, like rent or electric.'
            : 'No recurring bills yet. The owner or a full member will set them up.'}
        </p>
      ) : (
        <ul className="bill-list" aria-label="Recurring bills">
          {data.bills.map((bill) => (
            <li key={bill.id} className="bill-row">
              <span className="bill-main">
                <strong>{bill.name}</strong>
                <small>
                  {dueDayLabel(bill.dueDay)} · {bill.categoryName}
                  {bill.autopay && ' · '}
                  {bill.autopay && <span className="bill-autopay">Autopay</span>}
                </small>
              </span>
              <span className="bill-estimate">{formatMoney(bill.estimateCents)}</span>
              {can.write && (
                <button
                  type="button"
                  className="category-delete"
                  aria-label={`Remove ${bill.name}`}
                  onClick={() => void remove(bill.id)}
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <dl className="bill-totals">
        <div>
          <dt>Total per month</dt>
          <dd data-testid="bills-total">{formatMoney(data.totalCents)}</dd>
        </div>
        <div>
          <dt>Share of take-home pay</dt>
          <dd data-testid="bills-share">{shareOfTakeHome(data.totalCents, data.takeHomeCents)}</dd>
        </div>
      </dl>

      {problem !== null && <p role="alert">{problem}</p>}

      {can.write && (
        <>
          <form
            className="account-add bill-add"
            onSubmit={(e) => {
              e.preventDefault();
              void add();
            }}
          >
            <label>
              Bill name
              <input
                type="text"
                placeholder="e.g. Electric"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              Estimate
              <input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={estimate}
                onChange={(e) => setEstimate(e.target.value)}
              />
            </label>
            <label>
              Due day
              <input
                type="text"
                inputMode="numeric"
                placeholder="1–28"
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value)}
              />
            </label>
            <label>
              Category
              <select value={chosenCategory} onChange={(e) => setCategoryId(e.target.value)}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="bill-autopay-field">
              <input
                type="checkbox"
                checked={autopay}
                onChange={(e) => setAutopay(e.target.checked)}
              />
              Autopay
            </label>
            <button type="submit" className="button">
              Add bill
            </button>
          </form>

          <div className="category-suggestions">
            <span>Common ones:</span>
            {SUGGESTED_BILLS.map((suggestion) => {
              const used = isSuggestionUsed(suggestion, billNames);
              return (
                <button
                  key={suggestion}
                  type="button"
                  className={used ? 'chip suggestion-used' : 'chip'}
                  disabled={used}
                  onClick={() => setName(suggestion)}
                >
                  {suggestion}
                </button>
              );
            })}
          </div>
        </>
      )}

      <p className="category-help">
        Use your best estimate. You enter the real amount each month when you pay the bill. Due days
        run from 1 to 28.
      </p>
    </div>
  );
}
