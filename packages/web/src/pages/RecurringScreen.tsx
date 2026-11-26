import { useEffect, useState } from 'react';
import { GENERIC_ERROR } from '../auth/errors';
import { RoleProvider } from '../permissions';
import { Shell, type Route } from '../shell/Shell';
import type { MeResult } from './Hello';
import { RecurringPage, type RecurringClient } from './RecurringPage';

export interface RecurringScreenProps {
  client: RecurringClient & { me: { query: () => Promise<MeResult> } };
  onNavigate: (route: Route) => void;
}

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; me: MeResult };

/** The Recurring bills page inside the app shell, with the member's role. */
export function RecurringScreen({ client, onNavigate }: RecurringScreenProps) {
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

  const household = state.kind === 'ready' ? state.me.household : null;
  return (
    <RoleProvider role={household?.role}>
      <Shell route="recurring" onNavigate={onNavigate}>
        {state.kind === 'loading' && <p role="status">Loading…</p>}
        {(state.kind === 'error' || (state.kind === 'ready' && household === null)) && (
          <p role="alert">{GENERIC_ERROR}</p>
        )}
        {household !== null && <RecurringPage client={client} />}
      </Shell>
    </RoleProvider>
  );
}
