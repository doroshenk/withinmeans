import {
  dollarText,
  expectedWhenText,
  formatMoney,
  formatMonthDay,
  formatShortDate,
  monthLabel,
  monthName,
  nextThreePaydayMonth,
  parseDollars,
  receivedDifferenceText,
  receivedDraftError,
  receivedPreviewText,
} from '@withinmeans/domain';
import { useId, useState } from 'react';
import { useCan } from '../../permissions';
import type { PageRow, PaychecksData } from './types';

export interface Received {
  id: string;
  receivedCents: number;
  receivedDate: string;
}

export interface PaycheckListProps {
  data: PaychecksData;
  saving: boolean;
  problem: string | null;
  /** Shows the draft's problem; null clears it. */
  onProblem: (problem: string | null) => void;
  /** Resolves true once saved. */
  onReceived: (paycheck: PageRow, received: Received) => Promise<boolean>;
  onUndo: (id: string) => void;
}

/** Spec §6.4: the month's paydays, to mark received or undo. */
export function PaycheckList({
  data,
  saving,
  problem,
  onProblem,
  onReceived,
  onUndo,
}: PaycheckListProps) {
  const can = useCan();
  const id = useId();
  const [marking, setMarking] = useState<string | null>(null);
  const month = monthName(data.ym);
  const changeable = can.write && data.status === 'open';
  const extra = data.schedules.flatMap((schedule) => {
    if (schedule.frequency !== 'biweekly') return [];
    const ym = nextThreePaydayMonth(schedule, data.ym);
    return ym === null ? [] : [{ id: schedule.id, name: schedule.name, ym }];
  });

  return (
    <section className="card" aria-labelledby={`${id}-title`}>
      <div className="card-head">
        <h2 id={`${id}-title`}>{month} paychecks</h2>
        <p className="help">From your paycheck schedules</p>
      </div>
      {data.status === 'closed' && (
        <p className="help">{month} is closed, so its income can’t be changed.</p>
      )}
      {data.status === 'not-started' && data.paychecks.length > 0 && (
        <p className="help">A preview. Paychecks can be marked once {month} is started.</p>
      )}
      {problem !== null && (
        <p role="alert" className="error">
          {problem}
        </p>
      )}
      {data.paychecks.length === 0 ? (
        <div className="section-empty">
          <p>
            <strong>No paychecks in {month}</strong>
          </p>
          <p className="help">Paydays from your schedules show up here.</p>
        </div>
      ) : (
        <ul className="pay-list">
          {data.paychecks.map((pay) => {
            const date = formatMonthDay(pay.expectedDate);
            const what = `${date} ${pay.scheduleName}`;
            const received = pay.receivedCents !== null;
            const detail = received
              ? [
                  `Received ${formatMonthDay(pay.receivedDate ?? pay.expectedDate)}`,
                  pay.accountName,
                ]
              : [
                  expectedWhenText(pay.expectedDate, data.today),
                  `${formatMoney(pay.expectedCents)} expected`,
                ];
            return (
              <li
                key={`${pay.scheduleId} ${pay.expectedDate}`}
                className={received ? 'pay-row pay-received' : 'pay-row'}
              >
                <span className="pay-mark" aria-hidden="true">
                  {received ? '✓' : ''}
                </span>
                <div className="pay-what">
                  <strong>{`${formatShortDate(pay.expectedDate)} · ${pay.scheduleName}`}</strong>
                  <span>{detail.filter((part) => part !== null).join(' · ')}</span>
                </div>
                <div className="pay-amount">
                  <strong>{formatMoney(pay.receivedCents ?? pay.expectedCents)}</strong>
                  {pay.receivedCents !== null && (
                    <span>{receivedDifferenceText(pay.receivedCents, pay.expectedCents)}</span>
                  )}
                </div>
                {changeable && pay.id !== null && received && (
                  <button
                    type="button"
                    className="button button-quiet"
                    aria-label={`Undo ${what}`}
                    disabled={saving}
                    onClick={() => onUndo(pay.id ?? '')}
                  >
                    Undo
                  </button>
                )}
                {changeable && !received && marking !== pay.id && (
                  <button
                    type="button"
                    className="button button-quiet"
                    aria-label={`Mark ${what} received`}
                    onClick={() => {
                      onProblem(null);
                      setMarking(pay.id);
                    }}
                  >
                    Mark received
                  </button>
                )}
                {changeable && !received && pay.id !== null && marking === pay.id && (
                  <ReceivedForm
                    pay={pay}
                    saving={saving}
                    onProblem={onProblem}
                    onCancel={() => {
                      onProblem(null);
                      setMarking(null);
                    }}
                    onSave={async (value) => {
                      if (await onReceived(pay, { id: pay.id ?? '', ...value })) setMarking(null);
                    }}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
      {extra.map((e) => (
        <p key={e.id} className="pay-heads-up">
          {`Heads up: ${monthLabel(e.ym)} has 3 paydays for ${e.name} — an extra paycheck.`}
        </p>
      ))}
    </section>
  );
}

interface ReceivedFormProps {
  pay: PageRow;
  saving: boolean;
  onProblem: (problem: string | null) => void;
  onCancel: () => void;
  onSave: (value: Omit<Received, 'id'>) => Promise<void>;
}

/** Spec §5.9 "Mark received": the amount that landed (prefilled with the expected one) and when. */
function ReceivedForm({ pay, saving, onProblem, onCancel, onSave }: ReceivedFormProps) {
  const id = useId();
  const [amount, setAmount] = useState(dollarText(pay.expectedCents));
  const [date, setDate] = useState(pay.expectedDate);
  const preview = receivedPreviewText(amount, pay.expectedCents);

  const submit = () => {
    const error = receivedDraftError({ amountText: amount, date });
    onProblem(error ?? null);
    if (error !== undefined) return;
    void onSave({ receivedCents: parseDollars(amount) ?? 0, receivedDate: date });
  };

  return (
    <form
      className="pay-received-form"
      aria-label="Mark received"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <p className="help">
        Enter the amount that actually landed. Paychecks can vary, so this replaces the expected
        amount for this payday only.
      </p>
      <div className="field">
        <label htmlFor={`${id}-amount`}>Amount received</label>
        <input
          id={`${id}-amount`}
          type="text"
          inputMode="decimal"
          autoFocus
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor={`${id}-date`}>Date received</label>
        <input
          id={`${id}-date`}
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>
      <div className="form-actions">
        <button type="button" className="button button-quiet" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="button" disabled={saving}>
          Confirm received
        </button>
      </div>
      {preview !== null && <p className="pay-difference">{preview}</p>}
    </form>
  );
}
