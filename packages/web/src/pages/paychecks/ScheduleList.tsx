import { formatMoney, formatMonthDay, nextPaydays } from '@withinmeans/domain';
import { useId } from 'react';
import { useCan } from '../../permissions';
import { FREQUENCY_LABEL } from './frequencyLabel';
import type { PageSchedule } from './types';

/** How many coming paydays a schedule shows. */
export const PAYDAYS_SHOWN = 4;

export interface ScheduleListProps {
  /** "YYYY-MM-DD" */
  today: string;
  schedules: PageSchedule[];
  saving: boolean;
  problem: string | null;
  onAdd: () => void;
  onEdit: (id: string) => void;
  onRestart: (schedule: PageSchedule) => void;
}

/** Spec §6.4: the pay schedules, running and stopped. */
export function ScheduleList({
  today,
  schedules,
  saving,
  problem,
  onAdd,
  onEdit,
  onRestart,
}: ScheduleListProps) {
  const can = useCan();
  const id = useId();

  return (
    <section className="card" aria-labelledby={`${id}-title`}>
      <div className="card-head">
        <h2 id={`${id}-title`}>Paycheck schedules</h2>
        {can.write && (
          <button
            type="button"
            className="button button-quiet"
            aria-label="Add a paycheck schedule"
            onClick={onAdd}
          >
            + Add
          </button>
        )}
      </div>
      {problem !== null && (
        <p role="alert" className="error">
          {problem}
        </p>
      )}
      {schedules.length === 0 && (
        <div className="section-empty">
          <p>
            <strong>No paycheck schedules</strong>
          </p>
          <p className="help">Add the pay that repeats, like a job.</p>
        </div>
      )}
      {schedules.map((schedule) => (
        <article
          key={schedule.id}
          className={schedule.endedOn === null ? 'schedule' : 'schedule schedule-stopped'}
          aria-label={schedule.name}
        >
          <div className="card-head">
            <div className="pay-what">
              <strong>{schedule.name}</strong>
              <span>
                {[
                  FREQUENCY_LABEL[schedule.frequency],
                  schedule.accountName === null ? null : `into ${schedule.accountName}`,
                ]
                  .filter((part) => part !== null)
                  .join(' · ')}
              </span>
            </div>
            {can.write && (
              <button
                type="button"
                className="button button-quiet"
                aria-label={`Edit ${schedule.name}`}
                onClick={() => onEdit(schedule.id)}
              >
                <span aria-hidden="true">✎</span>
              </button>
            )}
          </div>
          <dl className="schedule-amounts">
            <div>
              <dt>Expected per paycheck</dt>
              <dd>{formatMoney(schedule.usualCents)}</dd>
            </div>
            <div>
              <dt>Average of last 6</dt>
              <dd>
                {schedule.averageCents === null
                  ? 'Nothing received yet'
                  : formatMoney(schedule.averageCents)}
              </dd>
            </div>
          </dl>
          {schedule.endedOn === null ? (
            <>
              <p className="schedule-next">Next paydays</p>
              <ul className="payday-chips">
                {nextPaydays(schedule, today, PAYDAYS_SHOWN).map((date) => (
                  <li key={date}>{formatMonthDay(date)}</li>
                ))}
              </ul>
            </>
          ) : (
            <div className="form-actions">
              <p className="help">Stopped {formatMonthDay(schedule.endedOn)}</p>
              {can.write && (
                <button
                  type="button"
                  className="button button-quiet"
                  aria-label={`Restart ${schedule.name}`}
                  disabled={saving}
                  onClick={() => onRestart(schedule)}
                >
                  Restart
                </button>
              )}
            </div>
          )}
        </article>
      ))}
    </section>
  );
}
