import { useEffect, useMemo, useState } from 'react';
import type { AcceptInviteInput, InvitePartnerInput, SignUpInput } from '@withinmeans/domain';
import type { AuthClient } from './auth/types';
import type { InviteDetails } from './pages/Accept';
import { Hello, type HelloProps } from './pages/Hello';
import { SignIn } from './pages/SignIn';
import { SignUp, type PendingInvite } from './pages/SignUp';

export interface AppProps {
  auth: AuthClient;
  /** Builds the API client; injected so tests can supply a fake. */
  createClient: (auth: AuthClient) => HelloProps['client'] & {
    signUp: { mutate: (input: SignUpInput) => Promise<unknown> };
    invitePartner: { mutate: (input: InvitePartnerInput) => Promise<PendingInvite> };
    resendInvite: { mutate: (input: { inviteId: string }) => Promise<PendingInvite> };
    inviteDetails: { query: (input: { token: string }) => Promise<InviteDetails> };
    acceptInvite: { mutate: (input: AcceptInviteInput) => Promise<unknown> };
  };
  /** The page address; injected so tests can open an invite link. Defaults to the browser's. */
  location?: { pathname: string; search: string };
}

type View = 'checking' | 'sign-in' | 'sign-up' | 'hello';

export function App({ auth, createClient }: AppProps) {
  const [view, setView] = useState<View>('checking');
  const client = useMemo(() => createClient(auth), [auth, createClient]);

  // Already signed in (a saved session)? Go straight to the app.
  useEffect(() => {
    void auth.getAccessToken().then((token) => setView(token ? 'hello' : 'sign-in'));
  }, [auth]);

  if (view === 'checking') return <p role="status">Loading…</p>;
  if (view === 'sign-up') {
    return (
      <SignUp
        auth={auth}
        signUp={(input) => client.signUp.mutate(input)}
        invitePartner={(input) => client.invitePartner.mutate(input)}
        resendInvite={(input) => client.resendInvite.mutate(input)}
        onSignedIn={() => setView('hello')}
        onShowSignIn={() => setView('sign-in')}
      />
    );
  }
  if (view === 'sign-in') {
    return (
      <SignIn
        auth={auth}
        onSignedIn={() => setView('hello')}
        onShowSignUp={() => setView('sign-up')}
      />
    );
  }
  return (
    <Hello
      client={client}
      onSignOut={() => {
        auth.signOut();
        setView('sign-in');
      }}
    />
  );
}
