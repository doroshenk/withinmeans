import { useEffect, useState } from 'react';
import { GENERIC_ERROR } from '../auth/errors';
import { RoleProvider } from '../permissions';
import type { MeResult } from './Hello';
import { SetupWizard, type SetupClient } from './SetupWizard';

export interface SetupPageProps {
  client: SetupClient & { me: { query: () => Promise<MeResult> } };
  onExit: () => void;
}

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; me: MeResult };

/** Loads who the member is (for the role and household name), then shows the wizard. */
export function SetupPage({ client, onExit }: SetupPageProps) {
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

  if (state.kind === 'loading') return <p role="status">Loading…</p>;
  if (state.kind === 'error' || state.me.household === null) {
    return <p role="alert">{GENERIC_ERROR}</p>;
  }
  return (
    <RoleProvider role={state.me.household.role}>
      <SetupWizard client={client} householdName={state.me.household.name} onExit={onExit} />
    </RoleProvider>
  );
}
