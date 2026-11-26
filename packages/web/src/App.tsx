import { useEffect, useMemo, useState } from 'react';
import type { AcceptInviteInput, InvitePartnerInput, SignUpInput } from '@withinmeans/domain';
import type { AuthClient } from './auth/types';
import { Accept, type InviteDetails } from './pages/Accept';
import { ForgotPassword } from './pages/ForgotPassword';
import { Hello, type HelloProps } from './pages/Hello';
import type { RecurringClient } from './pages/RecurringPage';
import { RecurringScreen } from './pages/RecurringScreen';
import { SignIn } from './pages/SignIn';
import { SetupPage } from './pages/SetupPage';
import type { SetupClient } from './pages/SetupWizard';
import { SignUp, type PendingInvite } from './pages/SignUp';
import type { Route } from './shell/Shell';

export interface AppProps {
  auth: AuthClient;
  /** Builds the API client; injected so tests can supply a fake. */
  createClient: (auth: AuthClient) => HelloProps['client'] &
    SetupClient &
    RecurringClient & {
      signUp: { mutate: (input: SignUpInput) => Promise<unknown> };
      invitePartner: { mutate: (input: InvitePartnerInput) => Promise<PendingInvite> };
      resendInvite: { mutate: (input: { inviteId: string }) => Promise<PendingInvite> };
      inviteDetails: { query: (input: { token: string }) => Promise<InviteDetails> };
      acceptInvite: { mutate: (input: AcceptInviteInput) => Promise<unknown> };
    };
  /** The page address; injected so tests can open an invite link. Defaults to the browser's. */
  location?: { pathname: string; search: string };
}

type View =
  'checking' | 'forgot' | 'sign-in' | 'sign-up' | 'hello' | 'accept' | 'setup' | 'recurring';

/** The pages that exist so far; later tickets add theirs. */
const PAGES: Partial<Record<Route, View>> = { dashboard: 'hello', recurring: 'recurring' };

/** The secret from an invite link (`/accept?token=…`); undefined on any other page. */
function inviteToken(location: { pathname: string; search: string }): string | undefined {
  if (location.pathname !== '/accept') return undefined;
  return new URLSearchParams(location.search).get('token') ?? '';
}

export function App({ auth, createClient, location = window.location }: AppProps) {
  const token = inviteToken(location);
  const [view, setView] = useState<View>(token === undefined ? 'checking' : 'accept');
  const client = useMemo(() => createClient(auth), [auth, createClient]);

  // Already signed in (a saved session)? Go straight to the app.
  useEffect(() => {
    if (token !== undefined) return;
    void auth.getAccessToken().then((token) => setView(token ? 'hello' : 'sign-in'));
  }, [auth, token]);

  const navigate = (route: Route) => setView((current) => PAGES[route] ?? current);

  if (view === 'checking') return <p role="status">Loading…</p>;
  if (view === 'accept' && token !== undefined) {
    return (
      <Accept
        auth={auth}
        token={token}
        inviteDetails={(input) => client.inviteDetails.query(input)}
        acceptInvite={(input) => client.acceptInvite.mutate(input)}
        onSignedIn={() => setView('hello')}
        onShowSignIn={() => setView('sign-in')}
      />
    );
  }
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
  if (view === 'setup') return <SetupPage client={client} onExit={() => setView('hello')} />;
  if (view === 'recurring') return <RecurringScreen client={client} onNavigate={navigate} />;
  if (view === 'forgot') return <ForgotPassword auth={auth} onBack={() => setView('sign-in')} />;
  if (view === 'sign-in') {
    return (
      <SignIn
        auth={auth}
        onSignedIn={() => setView('hello')}
        onShowSignUp={() => setView('sign-up')}
        onForgotPassword={() => setView('forgot')}
      />
    );
  }
  return (
    <Hello
      client={client}
      onNavigate={navigate}
      onStartSetup={() => setView('setup')}
      onSignOut={() => {
        auth.signOut();
        setView('sign-in');
      }}
    />
  );
}
