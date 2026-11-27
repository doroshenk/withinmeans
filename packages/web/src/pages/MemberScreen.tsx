import { useEffect, useState, type ReactNode } from 'react';
import { GENERIC_ERROR } from '../auth/errors';
import { RoleProvider } from '../permissions';
import { Shell, type Route } from '../shell/Shell';
import type { MeResult } from './Hello';
import { NoHousehold, type NoHouseholdProps } from './NoHousehold';

export interface MemberScreenProps extends Omit<NoHouseholdProps, 'email'> {
  client: { me: { query: () => Promise<MeResult> } };
  route: Route;
  onNavigate: (route: Route) => void;
  /** The page, shown once the member is known. */
  children: ReactNode;
}

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; me: MeResult };

/** A page inside the app shell, with the member's role. */
export function MemberScreen({
  client,
  route,
  onNavigate,
  children,
  ...account
}: MemberScreenProps) {
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
      <Shell route={route} onNavigate={onNavigate}>
        {state.kind === 'loading' && <p role="status">Loading…</p>}
        {state.kind === 'error' && <p role="alert">{GENERIC_ERROR}</p>}
        {state.kind === 'ready' && household === null && (
          <main className="hello">
            <NoHousehold email={state.me.user?.email} {...account} />
          </main>
        )}
        {household !== null && children}
      </Shell>
    </RoleProvider>
  );
}
