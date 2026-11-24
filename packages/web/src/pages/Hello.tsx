import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@withinmeans/api';
import { useEffect, useState } from 'react';
import { GENERIC_ERROR } from '../auth/errors';
import { RoleProvider } from '../permissions';
import { Shell } from '../shell/Shell';

export type MeResult = inferRouterOutputs<AppRouter>['me'];

export interface HelloProps {
  client: { me: { query: () => Promise<MeResult> } };
  onSignOut?: () => void;
  /** Opens the setup wizard (spec §3). */
  onStartSetup?: () => void;
}

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; me: MeResult };

export function Hello({ client, onSignOut, onStartSetup }: HelloProps) {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    client.me.query().then(
      (me) => !cancelled && setState({ kind: 'ready', me }),
      () => !cancelled && setState({ kind: 'error' }),
    );
    return () => {
      cancelled = true;
    };
  }, [client]);

  return (
    <RoleProvider role={state.kind === 'ready' ? state.me.household?.role : undefined}>
      <Shell route="dashboard" onNavigate={() => {}}>
        <main className="hello">
          {state.kind === 'loading' && <p role="status">Loading…</p>}
          {state.kind === 'error' && <p role="alert">{GENERIC_ERROR}</p>}
          {state.kind === 'ready' && (
            <>
              <h1>{`Hello ${state.me.user?.name ?? 'there'}`}</h1>
              {state.me.household && <p>{state.me.household.name}</p>}
              {onStartSetup && state.me.household && state.me.household.role !== 'view' && (
                <button type="button" className="button" onClick={onStartSetup}>
                  Start setting up
                </button>
              )}
            </>
          )}
          {onSignOut && (
            <button type="button" className="button button-quiet" onClick={onSignOut}>
              Sign out
            </button>
          )}
        </main>
      </Shell>
    </RoleProvider>
  );
}
