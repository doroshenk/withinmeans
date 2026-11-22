import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@withinmeans/api';

export type MeResult = inferRouterOutputs<AppRouter>['me'];

export interface HelloProps {
  client: { me: { query: () => Promise<MeResult> } };
}

export function Hello(_props: HelloProps) {
  return null;
}
