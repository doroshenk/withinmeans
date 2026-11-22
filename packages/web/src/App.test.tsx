import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';
import type { AuthClient } from './auth/types';
import type { MeResult } from './pages/Hello';

function setup(token: string | undefined) {
  const auth: AuthClient = {
    signIn: vi.fn(() => Promise.resolve()),
    signUp: vi.fn(() => Promise.resolve()),
    signOut: vi.fn(),
    getAccessToken: vi.fn(() => Promise.resolve(token)),
  };
  const me: MeResult = { user: { name: 'Sam', email: 'sam@example.com' }, household: null };
  const createClient = vi.fn(() => ({ me: { query: () => Promise.resolve(me) } }));
  render(<App auth={auth} createClient={createClient} />);
  return { auth, user: userEvent.setup() };
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
    expect(screen.getByRole('heading', { name: 'Create your login' })).toBeInTheDocument();

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
