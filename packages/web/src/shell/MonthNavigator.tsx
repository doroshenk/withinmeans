export type MonthStatus = 'open' | 'closed' | 'not-started';

export interface MonthNavigatorProps {
  month: string;
  status: MonthStatus;
  onChange: (month: string) => void;
}

export function MonthNavigator(_props: MonthNavigatorProps): never {
  throw new Error('not implemented');
}
