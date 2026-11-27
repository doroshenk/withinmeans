import type { Route } from '../shell/Shell';
import type { BillsPageClient } from './bills/types';

export interface BillsPageProps {
  client: BillsPageClient;
  onNavigate?: (route: Route) => void;
}

/** Spec §6.2: a month's bills and cash flow. */
export function BillsPage(_props: BillsPageProps) {
  return <main className="page" />;
}
