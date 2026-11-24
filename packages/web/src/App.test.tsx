import { render, screen } from '@testing-library/react';
import { categoriesStub } from './pages/categoriesStub';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';
import type { AuthClient } from './auth/types';
import type { MeResult } from './pages/Hello';

function setup(token: string | undefined, location?: { pathname: string; search: string }) {
  const auth: AuthClient = {
    signIn: vi.fn(() => Promise.resolve()),
    signOut: vi.fn(),
    forgotPassword: vi.fn(() => Promise.resolve()),
    resetPassword: vi.fn(() => Promise.resolve()),
    getAccessToken: vi.fn(() => Promise.resolve(token)),
  };
  const me: MeResult = {
    user: { name: 'Sam', email: 'sam@example.com' },
    household: { name: 'The Examples', role: 'owner' },
  };
  const pending = {
    id: 'inv-1',
    name: 'Pat',
    email: 'pat@example.com',
    status: 'pending' as const,
    daysLeft: 7,
  };
  const invitePartner = vi.fn((_input: unknown) => Promise.resolve(pending));
  const inviteDetails = vi.fn((_input: unknown) =>
    Promise.resolve({
      inviterName: 'Sam',
      householdName: 'The Examples',
      inviteeName: 'Pat',
      email: 'pat@example.com',
      role: 'full' as const,
      note: '',
    }),
  );
  const acceptInvite = vi.fn((_input: unknown) => Promise.resolve({ status: 'joined' }));
  const createClient = vi.fn(() => ({
    me: { query: () => Promise.resolve(me) },
    signUp: { mutate: () => Promise.resolve({ status: 'created' }) },
    invitePartner: { mutate: invitePartner },
    resendInvite: { mutate: () => Promise.resolve(pending) },
    inviteDetails: { query: inviteDetails },
    acceptInvite: { mutate: acceptInvite },
    ...categoriesStub,
    setupProgress: { query: () => Promise.resolve([]) },
    saveSetupStep: { mutate: () => Promise.resolve({}) },
  }));
  render(
    <App
      auth={auth}
      createClient={createClient}
      {...(location === undefined ? {} : { location })}
    />,
  );
  return { auth, invitePartner, inviteDetails, acceptInvite, user: userEvent.setup() };
}

describe('App', () => {
  it('P1-08: Start setting up opens the setup wizard, and Leave setup returns', async () => {
    const { user } = setup('tok');

    await user.click(await screen.findByRole('button', { name: 'Start setting up' }));
    expect(await screen.findByText('Step 1 of 9')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Leave setup' }));
    expect(await screen.findByRole('heading', { name: 'Hello Sam' })).toBeInTheDocument();
  });

  it('goes straight to Hello when a saved session is still valid', async () => {
    setup('token');

    expect(await screen.findByRole('heading', { name: 'Hello Sam' })).toBeInTheDocument();
  });

  it('shows sign-in when there is no session, then Hello after signing in', async () => {
    const { user } = setup(undefined);

    await user.type(await screen.findByLabelText('Email'), 'sam@example.com');
    await user.type(screen.getByLabelText('Password'), 'hunter22');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('heading', { name: 'Hello Sam' })).toBeInTheDocument();
  });

  it('switches between sign-in and sign-up', async () => {
    const { user } = setup(undefined);

    await user.click(await screen.findByRole('button', { name: 'Create an account' }));
    expect(screen.getByRole('heading', { name: "Who's managing the money?" })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
  });

  it('signs out and returns to sign-in', async () => {
    const { auth, user } = setup('token');

    await user.click(await screen.findByRole('button', { name: 'Sign out' }));

    expect(auth.signOut).toHaveBeenCalledOnce();
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
  });
});

describe('App sign-up', () => {
  it('P1-02: after signing up, Start setting up signs in and lands in the app', async () => {
    const { auth, user } = setup(undefined);
    await user.click(await screen.findByRole('button', { name: 'Create an account' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.type(screen.getByLabelText('First name'), 'Sam');
    await user.type(screen.getByLabelText('Email'), 'sam@example.com');
    await user.type(screen.getByLabelText('Password'), 'abcd1234');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    await user.click(await screen.findByRole('button', { name: 'Start setting up' }));

    expect(auth.signIn).toHaveBeenCalledWith('sam@example.com', 'abcd1234', false);
    expect(await screen.findByRole('heading', { name: 'Hello Sam' })).toBeInTheDocument();
  });
});

describe('App partner sign-up', () => {
  it('P1-03: partner mode sends the invite through the API and lands in the app', async () => {
    const { user, invitePartner } = setup(undefined);
    await user.click(await screen.findByRole('button', { name: 'Create an account' }));
    await user.click(screen.getByRole('radio', { name: /Me and a partner/ }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.type(screen.getByLabelText('Household name'), 'The Examples');
    await user.type(screen.getByLabelText('First name'), 'Sam');
    await user.type(screen.getByLabelText('Email'), 'sam@example.com');
    await user.type(screen.getByLabelText('Password'), 'abcd1234');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await user.type(await screen.findByLabelText("Partner's first name"), 'Pat');
    await user.type(screen.getByLabelText("Partner's email"), 'pat@example.com');
    await user.click(screen.getByRole('button', { name: 'Send invite & finish' }));

    expect(invitePartner).toHaveBeenCalledWith({
      name: 'Pat',
      email: 'pat@example.com',
      role: 'full',
      note: '',
    });
    await user.click(await screen.findByRole('button', { name: 'Start setting up' }));
    expect(await screen.findByRole('heading', { name: 'Hello Sam' })).toBeInTheDocument();
  });
});

describe('App accept invite', () => {
  const link = { pathname: '/accept', search: '?token=tok%2Fabc' };

  it('P1-04: the invite link opens the accept screen with the token from the URL', async () => {
    const { inviteDetails } = setup(undefined, link);

    expect(
      await screen.findByRole('heading', { name: 'Sam invited you to The Examples' }),
    ).toBeInTheDocument();
    expect(inviteDetails).toHaveBeenCalledWith({ token: 'tok/abc' });
  });

  it('P1-04: joining signs in and lands in the app', async () => {
    const { auth, acceptInvite, user } = setup(undefined, link);
    await user.type(await screen.findByLabelText('Password'), 'abcd1234');
    await user.click(screen.getByRole('button', { name: 'Join household' }));

    expect(acceptInvite).toHaveBeenCalledWith({
      token: 'tok/abc',
      name: 'Pat',
      email: 'pat@example.com',
      password: 'abcd1234',
    });
    expect(auth.signIn).toHaveBeenCalledWith('pat@example.com', 'abcd1234', false);
    expect(await screen.findByRole('heading', { name: 'Hello Sam' })).toBeInTheDocument();
  });

  it('P1-04: an invite link with no token shows the expired-link message', async () => {
    setup(undefined, { pathname: '/accept', search: '' });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This invite link has expired or was already used.',
    );
  });

  it('P1-04: the accept screen can switch to sign-in', async () => {
    const { user } = setup(undefined, { pathname: '/accept', search: '' });
    await user.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
  });
});

describe('App routes', () => {
  it.each(['/', '/bills', '/paychecks', '/settings/household', '/accept-not'])(
    'P1-05: a signed-out user on %s lands on sign-in',
    async (pathname) => {
      setup(undefined, { pathname, search: '' });

      expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: /Hello/ })).not.toBeInTheDocument();
    },
  );

  it('P1-05: forgot password opens from sign-in and returns to it', async () => {
    const { user } = setup(undefined);

    await user.click(await screen.findByRole('button', { name: 'Forgot password?' }));
    expect(screen.getByRole('heading', { name: 'Reset your password' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back to sign in' }));
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
  });
});
