import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@withinmeans/api';
import { useEffect, useState } from 'react';
import { GENERIC_ERROR } from '../auth/errors';
import { RoleProvider } from '../permissions';
import { saveFile as saveToDisk } from '../saveFile';
import { Shell, type Route } from '../shell/Shell';
import { DownloadData } from './DownloadData';

export type MeResult = inferRouterOutputs<AppRouter>['me'];

export type ExportResult = inferRouterOutputs<AppRouter>['exportData'];

export interface HelloProps {
  client: {
    me: { query: () => Promise<MeResult> };
    exportData: { query: () => Promise<ExportResult> };
  };
  /** Saves a downloaded file; injected so tests can watch it. */
  saveFile?: (name: string, text: string) => void;
  onSignOut?: () => void;
  /** Opens the setup wizard (spec §3). */
  onStartSetup?: () => void;
  /** The sidebar or tab bar asked for another page. */
  onNavigate?: (route: Route) => void;
}

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; me: MeResult };

export function Hello({
  client,
  onSignOut,
  onStartSetup,
  onNavigate = () => {},
  saveFile = saveToDisk,
}: HelloProps) {
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
      <Shell route="dashboard" onNavigate={onNavigate}>
        <main className="hello">
          {state.kind === 'loading' && <p role="status">Loading…</p>}
          {state.kind === 'error' && <p role="alert">{GENERIC_ERROR}</p>}
          {state.kind === 'ready' && (
            <>
              <h1>{`Hello ${state.me.user?.name ?? 'there'}`}</h1>
              {state.me.household && <p>{state.me.household.name}</p>}
              {/* Placeholder until the Phase 4 dashboard. */}
              <p>Your dashboard is coming soon.</p>
              {onStartSetup && state.me.household && state.me.household.role !== 'view' && (
                <button type="button" className="button" onClick={onStartSetup}>
                  Start setting up
                </button>
              )}
              {state.me.household && (
                <DownloadData exportData={() => client.exportData.query()} saveFile={saveFile} />
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
