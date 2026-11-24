import { addMonths, parseYm } from '@withinmeans/domain';

export type MonthStatus = 'open' | 'closed' | 'not-started';

export interface MonthNavigatorProps {
  /** "YYYY-MM" */
  month: string;
  status: MonthStatus;
  onChange: (month: string) => void;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const CHIP_LABEL: Record<MonthStatus, string> = {
  open: 'Open',
  closed: 'Closed',
  'not-started': 'Not started',
};

/** Spec §6 intro: ‹ Month › with a status chip. Shown on Bills, Paychecks and Investment income. */
export function MonthNavigator({ month, status, onChange }: MonthNavigatorProps) {
  const { year, month: m } = parseYm(month);
  return (
    <div className="month-nav">
      <button
        type="button"
        className="icon-button"
        aria-label="Previous month"
        onClick={() => onChange(addMonths(month, -1))}
      >
        <span aria-hidden="true">‹</span>
      </button>
      <h2>{`${MONTH_NAMES[m - 1]} ${year}`}</h2>
      <button
        type="button"
        className="icon-button"
        aria-label="Next month"
        onClick={() => onChange(addMonths(month, 1))}
      >
        <span aria-hidden="true">›</span>
      </button>
      <span className={`chip chip-${status}`}>{CHIP_LABEL[status]}</span>
    </div>
  );
}
