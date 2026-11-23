import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';
import type { AuthClient } from './auth/types';
import type { MeResult } from './pages/Hello';

function setup(token: string | undefined) {
  const auth: AuthClient = {
    signIn: vi.fn(() => Promise.resolve()),
    signOut: vi.fn(),
    getAccessToken: vi.fn(() => Promise.resolve(token)),
  };
  const me: MeResult = { user: { name: 'Sam', email: 'sam@example.com' }, household: null };
  const pending = {
    id: 'inv-1',
    name: 'Pat',
    email: 'pat@example.com',
    status: 'pending' as const,
    daysLeft: 7,
  };
  const invitePartner = vi.fn((_input: unknown) => Promise.resolve(pending));
  const createClient = vi.fn(() => ({
    me: { query: () => Promise.resolve(me) },
    signUp: { mutate: () => Promise.resolve({ status: 'created' }) },
    invitePartner: { mutate: invitePartner },
    resendInvite: { mutate: () => Promise.resolve(pending) },
  }));
  render(<App auth={auth} createClient={createClient} />);
  return { auth, invitePartner, user: userEvent.setup() };
}

describe('App', () => {
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
