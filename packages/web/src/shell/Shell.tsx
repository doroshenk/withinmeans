import type { ReactNode } from 'react';

export type Route =
  | 'dashboard'
  | 'bills'
  | 'recurring'
  | 'paychecks'
  | 'accounts'
  | 'investment-income'
  | 'allocation'
  | 'year-in-review';

export interface ShellProps {
  route: Route;
  onNavigate: (route: Route) => void;
  children: ReactNode;
}

export function Shell(_props: ShellProps): never {
  throw new Error('not implemented');
}
