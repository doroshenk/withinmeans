import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AcceptInviteInput, InvitePartnerInput, SignUpInput } from '@withinmeans/domain';
import type { AuthClient } from './auth/types';
import { Accept, type InviteDetails } from './pages/Accept';
import { BillsPage } from './pages/BillsPage';
import type { BillsPageClient } from './pages/bills/types';
import { ForgotPassword } from './pages/ForgotPassword';
import { Hello, type HelloProps } from './pages/Hello';
import { MemberScreen } from './pages/MemberScreen';
import { PaychecksPage } from './pages/PaychecksPage';
import type { PaychecksPageClient } from './pages/paychecks/types';
import { RecurringPage, type RecurringClient } from './pages/RecurringPage';
import { SignIn } from './pages/SignIn';
import { SetupPage } from './pages/SetupPage';
import type { SetupClient } from './pages/SetupWizard';
import { SignUp, type PendingInvite } from './pages/SignUp';
import { QuickAddProvider } from './shell/quickAdd/context';
import type { Route } from './shell/Shell';

export interface AppProps {
  auth: AuthClient;
  /** Builds the API client; injected so tests can supply a fake. */
  createClient: (auth: AuthClient) => HelloProps['client'] &
    SetupClient &
    RecurringClient &
    BillsPageClient &
    PaychecksPageClient & {
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
  | 'checking'
  | 'forgot'
  | 'sign-in'
  | 'sign-up'
  | 'hello'
  | 'accept'
  | 'setup'
  | 'bills'
  | 'recurring'
  | 'paychecks';

/** The pages that exist so far; later tickets add theirs. */
const PAGES: Partial<Record<Route, View>> = {
  dashboard: 'hello',
  bills: 'bills',
  recurring: 'recurring',
  paychecks: 'paychecks',
};

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

  /** The month "View" in Quick Add asked for; `visit` remakes the page to show it. */
  const [target, setTarget] = useState<{ ym: string | undefined; visit: number }>({
    ym: undefined,
    visit: 0,
  });

  const navigate = useCallback((route: Route) => {
    // A page opened at a "View" month is remade, so it goes back to this month.
    setTarget((now) => (now.ym === undefined ? now : { ym: undefined, visit: now.visit + 1 }));
    setView((current) => PAGES[route] ?? current);
  }, []);
  const viewEntry = useCallback((route: Route, ym?: string) => {
    setTarget((now) => ({ ym, visit: now.visit + 1 }));
    setView((current) => PAGES[route] ?? current);
  }, []);
  const withQuickAdd = (screen: ReactNode) => (
    <QuickAddProvider client={client} onView={viewEntry}>
      {screen}
    </QuickAddProvider>
  );

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
  if (view === 'bills' || view === 'recurring' || view === 'paychecks') {
    const month = target.ym === undefined ? {} : { initialYm: target.ym };
    return withQuickAdd(
      <MemberScreen client={client} route={view} onNavigate={navigate}>
        {view === 'bills' && (
          <BillsPage key={target.visit} client={client} onNavigate={navigate} {...month} />
        )}
        {view === 'recurring' && <RecurringPage client={client} />}
        {view === 'paychecks' && <PaychecksPage key={target.visit} client={client} {...month} />}
      </MemberScreen>,
    );
  }
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
  return withQuickAdd(
    <Hello
      client={client}
      onNavigate={navigate}
      onStartSetup={() => setView('setup')}
      onSignOut={() => {
        auth.signOut();
        setView('sign-in');
      }}
    />,
  );
}
