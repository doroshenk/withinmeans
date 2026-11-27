import { formatMoney, type BillsMonthSummary } from '@withinmeans/domain';

/** The four tiles at the top of design/Bills.png. */
export function BillTiles({ summary }: { summary: BillsMonthSummary }) {
  const paychecks = summary.paycheckCount === 1 ? 'paycheck' : 'paychecks';
  return (
    <section className="tiles" aria-label="Summary">
      <div className="tile" data-testid="tile-income">
        <p className="tile-label">Paychecks &amp; other income</p>
        <p className="tile-value">{formatMoney(summary.incomeCents)}</p>
        <p className="tile-note">
          {`${summary.paychecksReceived} of ${summary.paycheckCount} ${paychecks} received · +${formatMoney(summary.otherCents)} other`}
        </p>
      </div>
      <div className="tile" data-testid="tile-bills">
        <p className="tile-label">Bills + cards this month</p>
        <p className="tile-value">{formatMoney(summary.outCents)}</p>
        <p className="tile-note">
          {`${formatMoney(summary.billsCents)} bills · ${formatMoney(summary.cardsCents)} cards`}
        </p>
      </div>
      <div className="tile" data-testid="tile-paid">
        <p className="tile-label">Paid so far</p>
        <p className="tile-value">{formatMoney(summary.paidCents)}</p>
        <div
          className="progress"
          role="progressbar"
          aria-label="Share of bills and cards paid"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={summary.paidPct}
        >
          <span style={{ width: `${summary.paidPct}%` }} />
        </div>
      </div>
      <div className="tile tile-next" data-testid="tile-left">
        <p className="tile-label">Left after bills</p>
        <p className="tile-value">{formatMoney(summary.leftCents)}</p>
        <p className="tile-note">Paychecks, other income + investments moved to checking</p>
      </div>
    </section>
  );
}
