import {
  dollarText,
  formatShortDate,
  isPayDate,
  nextPaydays,
  parseDollars,
  parsePayDays,
  PAY_FREQUENCIES,
  payDraftError,
  type PayFrequency,
} from '@withinmeans/domain';
import { useId, useState } from 'react';
import { FREQUENCY_LABEL } from './frequencyLabel';
import { PAYDAYS_SHOWN } from './ScheduleList';
import type { PageSchedule, PaychecksData, ScheduleInput } from './types';

export interface ScheduleFormProps {
  /** The schedule being edited; undefined to add one. */
  schedule?: PageSchedule | undefined;
  /** "YYYY-MM-DD" */
  today: string;
  accounts: PaychecksData['accounts'];
  saving: boolean;
  problem: string | null;
  /** Shows the draft's problem; null clears it. */
  onProblem: (problem: string | null) => void;
  onSave: (input: ScheduleInput) => void;
  onCancel: () => void;
  onStop: () => void;
}

/** Spec §6.4: add or edit a pay schedule, and stop it. */
export function ScheduleForm({
  schedule,
  today,
  accounts,
  saving,
  problem,
  onProblem,
  onSave,
  onCancel,
  onStop,
}: ScheduleFormProps) {
  const id = useId();
  const [name, setName] = useState(schedule?.name ?? '');
  const [frequency, setFrequency] = useState<PayFrequency>(schedule?.frequency ?? 'biweekly');
  const [anchorDate, setAnchorDate] = useState(schedule?.anchorDate ?? '');
  const [takeHome, setTakeHome] = useState(schedule ? dollarText(schedule.usualCents) : '');
  const [firstDay, setFirstDay] = useState(String(schedule?.semimonthlyDays?.[0] ?? 1));
  const [secondDay, setSecondDay] = useState(String(schedule?.semimonthlyDays?.[1] ?? 15));
  const [picked, setPicked] = useState<string>();
  const [confirming, setConfirming] = useState(false);
  // The pick, else the schedule's own account, else primary checking: whichever still exists.
  const accountId = (
    accounts.find((a) => a.id === picked) ??
    accounts.find((a) => a.id === schedule?.accountId) ??
    accounts.find((a) => a.isPrimary) ??
    accounts[0]
  )?.id;
  const payDays = frequency === 'semimonthly' ? parsePayDays([firstDay, secondDay]) : null;
  const upcoming =
    isPayDate(anchorDate) && payDays !== undefined
      ? nextPaydays({ frequency, anchorDate, semimonthlyDays: payDays }, today, PAYDAYS_SHOWN)
      : [];
  const title = schedule ? 'Edit paycheck schedule' : 'Set up a paycheck';

  const submit = () => {
    const error = payDraftError({
      name,
      frequency,
      anchorDate,
      takeHomeText: takeHome,
      dayTexts: [firstDay, secondDay],
    });
    onProblem(error ?? null);
    if (error !== undefined) return;
    onSave({
      name: name.trim(),
      frequency,
      anchorDate,
      ...(payDays && { semimonthlyDays: payDays }),
      usualCents: parseDollars(takeHome) ?? 0,
      ...(accountId !== undefined && { accountId }),
    });
  };

  return (
    <form
      className="card schedule-form"
      aria-label={title}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <h2>{title}</h2>
      <p className="help">
        Each payday shows up as an expected paycheck. Mark it received when it lands and enter the
        real amount.
      </p>
      <div className="schedule-fields">
        <div className="field">
          <label htmlFor={`${id}-name`}>Paycheck name</label>
          <input
            id={`${id}-name`}
            type="text"
            // The form opens below the paychecks: focus brings it into view.
            autoFocus
            placeholder="e.g. Main job"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={`${id}-frequency`}>How often</label>
          <select
            id={`${id}-frequency`}
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as PayFrequency)}
          >
            {PAY_FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {FREQUENCY_LABEL[f]}
              </option>
            ))}
          </select>
        </div>
        {frequency === 'semimonthly' && (
          <>
            <div className="field">
              <label htmlFor={`${id}-first`}>First pay day</label>
              <input
                id={`${id}-first`}
                type="text"
                inputMode="numeric"
                value={firstDay}
                onChange={(e) => setFirstDay(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor={`${id}-second`}>Second pay day</label>
              <input
                id={`${id}-second`}
                type="text"
                inputMode="numeric"
                value={secondDay}
                onChange={(e) => setSecondDay(e.target.value)}
              />
            </div>
          </>
        )}
        <div className="field">
          <label htmlFor={`${id}-anchor`}>A recent payday</label>
          <input
            id={`${id}-anchor`}
            type="date"
            value={anchorDate}
            onChange={(e) => setAnchorDate(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={`${id}-take-home`}>Expected take-home</label>
          <input
            id={`${id}-take-home`}
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={takeHome}
            onChange={(e) => setTakeHome(e.target.value)}
          />
        </div>
        {accounts.length > 0 && (
          <div className="field">
            <label htmlFor={`${id}-account`}>Deposits into</label>
            <select
              id={`${id}-account`}
              value={accountId}
              onChange={(e) => setPicked(e.target.value)}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div className="schedule-upcoming">
        <strong>Upcoming paydays:</strong>
        {upcoming.length === 0 ? (
          <span>Enter a recent payday to see them.</span>
        ) : (
          <ul className="payday-chips">
            {upcoming.map((date) => (
              <li key={date}>{formatShortDate(date)}</li>
            ))}
          </ul>
        )}
      </div>
      {schedule && (
        <p className="help">
          Changes apply to paychecks from today on that you haven&apos;t received yet. Stopping
          keeps its history, and you can restart it.
        </p>
      )}
      {problem !== null && (
        <p role="alert" className="error">
          {problem}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="button" disabled={saving}>
          Save schedule
        </button>
        <button type="button" className="button button-quiet" onClick={onCancel}>
          Cancel
        </button>
        {schedule && schedule.endedOn === null && !confirming && (
          <button
            type="button"
            className="button button-danger"
            onClick={() => setConfirming(true)}
          >
            Stop this paycheck
          </button>
        )}
      </div>
      {confirming && schedule && (
        <div className="confirm">
          <p>Stop {schedule.name}? Paychecks expected after today go away.</p>
          <button type="button" className="button button-danger" disabled={saving} onClick={onStop}>
            Yes, stop it
          </button>
          <button
            type="button"
            className="button button-quiet"
            onClick={() => setConfirming(false)}
          >
            Keep it
          </button>
        </div>
      )}
    </form>
  );
}
