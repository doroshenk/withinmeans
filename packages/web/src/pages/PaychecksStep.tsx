import {
  MAX_TAKE_HOME_CENTS,
  PAY_FREQUENCIES,
  formatMoney,
  formatMonthDay,
  isPayDate,
  monthlyPayCents,
  nextPaydays,
  parseDollars,
  parsePayDays,
  payDraftError,
  type PayFrequency,
} from '@withinmeans/domain';
import { useCallback, useEffect, useState } from 'react';
import { GENERIC_ERROR, apiErrorMessage } from '../auth/errors';
import { useCan } from '../permissions';
import { FREQUENCY_LABEL } from './paychecks/frequencyLabel';

export interface PayRow {
  id: string;
  name: string;
  frequency: PayFrequency;
  anchorDate: string;
  semimonthlyDays: [number, number] | null;
  usualCents: number;
  endedOn: string | null;
}

export interface PaychecksClient {
  setupPaychecks: { query: () => Promise<{ today: string; schedules: PayRow[] }> };
  addPaySchedule: {
    mutate: (input: {
      name: string;
      frequency: PayFrequency;
      anchorDate: string;
      semimonthlyDays?: [number, number];
      usualCents: number;
    }) => Promise<{ id: string }>;
  };
  removePaySchedule: { mutate: (input: { id: string }) => Promise<unknown> };
}

const THREE_PAYDAYS_NOTE = '2 months a year have 3 paydays';

type Data = Awaited<ReturnType<PaychecksClient['setupPaychecks']['query']>>;
type Load = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; data: Data };

/** "About $6,450.00 a month", and for pay every 2 weeks the note about 3 paydays. */
function estimate(frequency: PayFrequency, usualCents: number): string {
  const monthly = monthlyPayCents([{ frequency, usualCents, endedOn: null }]) ?? 0;
  const text = `About ${formatMoney(monthly)} a month`;
  return frequency === 'biweekly' ? `${text} · ${THREE_PAYDAYS_NOTE}` : text;
}

function paydaysText(
  schedule: Pick<PayRow, 'frequency' | 'anchorDate' | 'semimonthlyDays'>,
  today: string,
): string {
  return `Next paydays: ${nextPaydays(schedule, today).map(formatMonthDay).join(', ')}`;
}

/** Spec §3 step 3: pay schedules (name, frequency, a recent payday, usual take-home). */
export function PaychecksStep({ client }: { client: PaychecksClient }) {
  const can = useCan();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [name, setName] = useState('');
  const [frequency, setFrequency] = useState<PayFrequency>('biweekly');
  const [anchorDate, setAnchorDate] = useState('');
  const [takeHome, setTakeHome] = useState('');
  const [firstDay, setFirstDay] = useState('1');
  const [secondDay, setSecondDay] = useState('15');
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    setLoad({ kind: 'ready', data: await client.setupPaychecks.query() });
  }, [client]);

  useEffect(() => {
    let cancelled = false;
    client.setupPaychecks.query().then(
      (data) => !cancelled && setLoad({ kind: 'ready', data }),
      () => !cancelled && setLoad({ kind: 'error' }),
    );
    return () => {
      cancelled = true;
    };
  }, [client]);

  if (load.kind === 'loading') return <p role="status">Loading…</p>;
  if (load.kind === 'error') return <p role="alert">{GENERIC_ERROR}</p>;
  const { today } = load.data;
  const running = load.data.schedules.filter((s) => s.endedOn === null);
  const total = monthlyPayCents(running);

  const draftCents = parseDollars(takeHome) ?? 0;
  const payDays = frequency === 'semimonthly' ? parsePayDays([firstDay, secondDay]) : null;

  const add = async () => {
    if (saving) return;
    const error = payDraftError({
      name,
      frequency,
      anchorDate,
      takeHomeText: takeHome,
      dayTexts: [firstDay, secondDay],
    });
    if (error !== undefined) {
      setProblem(error);
      return;
    }
    setProblem(null);
    setSaving(true);
    try {
      await client.addPaySchedule.mutate({
        name: name.trim(),
        frequency,
        anchorDate,
        ...(payDays && { semimonthlyDays: payDays }),
        usualCents: draftCents,
      });
      setName('');
      setAnchorDate('');
      setTakeHome('');
      await reload();
    } catch (err) {
      setProblem(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    setProblem(null);
    try {
      await client.removePaySchedule.mutate({ id });
      await reload();
    } catch (err) {
      setProblem(apiErrorMessage(err));
    }
  };

  return (
    <div className="paychecks">
      {running.length === 0 ? (
        <p>
          {can.write
            ? 'No paychecks yet. Add the pay that repeats, like a job.'
            : 'No paychecks yet. The owner or a full member will set them up.'}
        </p>
      ) : (
        <ul className="bill-list" aria-label="Paychecks">
          {running.map((pay) => (
            <li key={pay.id} className="bill-row">
              <span className="bill-main pay-main">
                <strong>{pay.name}</strong>
                <small>
                  {FREQUENCY_LABEL[pay.frequency]} · {formatMoney(pay.usualCents)}
                </small>
                <small>{estimate(pay.frequency, pay.usualCents)}</small>
                <small>{paydaysText(pay, today)}</small>
              </span>
              {can.write && (
                <button
                  type="button"
                  className="category-delete"
                  aria-label={`Remove ${pay.name}`}
                  onClick={() => void remove(pay.id)}
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {total !== null && (
        <dl className="bill-totals">
          <div>
            <dt>Take-home in a typical month</dt>
            <dd data-testid="pay-total">{formatMoney(total)}</dd>
          </div>
        </dl>
      )}

      {problem !== null && <p role="alert">{problem}</p>}

      {can.write && (
        <form
          className="account-add"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <label>
            Paycheck name
            <input
              type="text"
              placeholder="e.g. Main job"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            How often
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as PayFrequency)}
            >
              {PAY_FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {FREQUENCY_LABEL[f]}
                </option>
              ))}
            </select>
          </label>
          {frequency === 'semimonthly' && (
            <>
              <label>
                First pay day
                <input
                  type="text"
                  inputMode="numeric"
                  value={firstDay}
                  onChange={(e) => setFirstDay(e.target.value)}
                />
              </label>
              <label>
                Second pay day
                <input
                  type="text"
                  inputMode="numeric"
                  value={secondDay}
                  onChange={(e) => setSecondDay(e.target.value)}
                />
              </label>
            </>
          )}
          <label>
            A recent payday
            <input type="date" value={anchorDate} onChange={(e) => setAnchorDate(e.target.value)} />
          </label>
          <label>
            Usual take-home
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={takeHome}
              onChange={(e) => setTakeHome(e.target.value)}
            />
          </label>
          <button type="submit" className="button" disabled={saving}>
            Add paycheck
          </button>
          <p className="pay-preview" data-testid="pay-preview">
            {draftCents > 0 && draftCents <= MAX_TAKE_HOME_CENTS
              ? estimate(frequency, draftCents)
              : 'Enter the usual take-home to see a monthly estimate'}
            {isPayDate(anchorDate) && payDays !== undefined && (
              <>
                {' · '}
                {paydaysText({ frequency, anchorDate, semimonthlyDays: payDays }, today)}
              </>
            )}
          </p>
        </form>
      )}

      <p className="category-help">
        Use your usual take-home. You enter the real amount when each paycheck lands.
      </p>
    </div>
  );
}
