import { addMonths, parseYm } from '@withinmeans/domain';

export type MonthStatus = 'open' | 'closed' | 'not-started';

export interface MonthNavigatorProps {
  /** "YYYY-MM" */
  month: string;
  status: MonthStatus;
  onChange: (month: string) => void;
  /** 1 when the month is the page's own title. */
  headingLevel?: 1 | 2;
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
export function MonthNavigator({ month, status, onChange, headingLevel = 2 }: MonthNavigatorProps) {
  const { year, month: m } = parseYm(month);
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
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
      <Heading>{`${MONTH_NAMES[m - 1]} ${year}`}</Heading>
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
