import type { ReactNode } from 'react';
import type { QuickAddClient } from './types';

export interface QuickAddProviderProps {
  client: QuickAddClient;
  /** "View" on an entry just added: show that page at that month ("YYYY-MM"). */
  onView: (route: 'bills' | 'paychecks' | 'recurring', ym?: string) => void;
  children: ReactNode;
}

/** Spec §5.14: lets the shell's "+ Add" open Quick Add over any page. */
export function QuickAddProvider({ children }: QuickAddProviderProps) {
  return <>{children}</>;
}
