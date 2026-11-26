import { formatMoney, type PaycheckMonthSummary } from '@withinmeans/domain';

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The four tiles at the top of design/Paychecks.png. */
export function SummaryTiles({ summary }: { summary: PaycheckMonthSummary }) {
  const tiles = [
    {
      id: 'received',
      label: 'Received so far',
      cents: summary.receivedCents,
      note: 'Paychecks + one-time income',
    },
    {
      id: 'expected',
      label: 'Still expected',
      cents: summary.stillExpectedCents,
      note:
        summary.toComeCount === 0
          ? 'Nothing left to come'
          : `${count(summary.toComeCount, 'paycheck', 'paychecks')} to come`,
    },
    {
      id: 'paychecks',
      label: 'Paychecks',
      cents: summary.paychecksCents,
      note: `${summary.paycheckCount} this month · actual + expected`,
    },
    {
      id: 'other',
      label: 'One-time income',
      cents: summary.otherCents,
      note: `${count(summary.otherCount, 'entry', 'entries')} this month`,
    },
  ];

  return (
    <section className="tiles" aria-label="Summary">
      {tiles.map((tile) => (
        <div
          key={tile.id}
          className={tile.id === 'received' ? 'tile tile-next' : 'tile'}
          data-testid={`tile-${tile.id}`}
        >
          <p className="tile-label">{tile.label}</p>
          <p className="tile-value">{formatMoney(tile.cents)}</p>
          <p className="tile-note">{tile.note}</p>
        </div>
      ))}
    </section>
  );
}
