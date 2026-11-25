import {
  dueInText,
  formatMoney,
  ordinal,
  shareOfTakeHome,
  type RecurringOverview,
} from '@withinmeans/domain';

const WEEK_DAYS = ['1st – 7th', '8th – 14th', '15th – 21st', '22nd – end'] as const;

const whole = (cents: number) => formatMoney(cents, { whole: true });
const billCount = (n: number) => `${n} ${n === 1 ? 'bill' : 'bills'}`;

/** The four tiles at the top of design/Recurring.png. */
export function SummaryTiles({
  overview,
  takeHomeCents,
}: {
  overview: RecurringOverview;
  takeHomeCents: number | null;
}) {
  const { nextUp } = overview;
  return (
    <section className="tiles" aria-label="Summary">
      <div className="tile" data-testid="tile-total">
        <p className="tile-label">Estimated each month</p>
        <p className="tile-value">{whole(overview.totalCents)}</p>
        <p className="tile-note">{billCount(overview.count)}</p>
      </div>
      <div className="tile" data-testid="tile-share">
        <p className="tile-label">Share of job income</p>
        <p className="tile-value">{shareOfTakeHome(overview.totalCents, takeHomeCents)}</p>
        <p className="tile-note">
          {takeHomeCents === null
            ? 'Shows once paychecks are added'
            : `of ${whole(takeHomeCents)} / month`}
        </p>
      </div>
      <div className="tile" data-testid="tile-autopay">
        <p className="tile-label">On autopay</p>
        <p className="tile-value">{`${overview.autopayCount} of ${overview.count}`}</p>
        <p className="tile-note">{`${overview.manualCount} you pay by hand`}</p>
      </div>
      <div className="tile tile-next" data-testid="tile-next">
        <p className="tile-label">Next up</p>
        <p className="tile-value">{nextUp?.name ?? 'Nothing due'}</p>
        {nextUp && (
          <p className="tile-note">
            {`${dueInText(nextUp.daysUntil).text} · ${whole(nextUp.estimateCents)}`}
          </p>
        )}
      </div>
    </section>
  );
}

/** "When they hit": estimates by week of the month. */
export function WeeksCard({ overview }: { overview: RecurringOverview }) {
  return (
    <section className="card">
      <h2>When they hit</h2>
      <p className="help">Estimated amounts by week of the month, based on due dates</p>
      <ul className="weeks">
        {overview.weeks.map((w) => (
          <li key={w.week} className="week" aria-label={`Week ${w.week}`}>
            <p>
              <strong>{`Week ${w.week}`}</strong>
              {` · ${WEEK_DAYS[w.week - 1]}`}
            </p>
            <p className="week-total">{whole(w.totalCents)}</p>
            <div className="week-bar" aria-hidden="true">
              <span style={{ width: `${w.barPercent}%` }} />
            </div>
            <ul className="week-bills">
              {w.bills.map((b) => (
                <li key={b.id}>{`${b.name} · ${ordinal(b.dueDay)}`}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
