import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AuthClient } from '../auth/types';
import { Accept, type InviteDetails } from './Accept';

const DETAILS: InviteDetails = {
  inviterName: 'Sam',
  householdName: 'The Examples',
  inviteeName: 'Pat',
  email: 'pat@example.com',
  role: 'view',
  note: 'Welcome aboard!',
};

function trpcError(code: string, message: string) {
  return Object.assign(new Error(message), { name: 'TRPCClientError', data: { code } });
}

function setup(
  over: {
    details?: () => Promise<InviteDetails>;
    acceptInvite?: (input: unknown) => Promise<unknown>;
    signIn?: () => Promise<void>;
  } = {},
) {
  const auth: AuthClient = {
    signIn: vi.fn(over.signIn ?? (() => Promise.resolve())),
    signOut: vi.fn(),
    getAccessToken: vi.fn(() => Promise.resolve(undefined)),
  };
  const props = {
    auth,
    token: 'tok-abc',
    inviteDetails: vi.fn(over.details ?? (() => Promise.resolve(DETAILS))),
    acceptInvite: vi.fn(over.acceptInvite ?? (() => Promise.resolve({ status: 'joined' }))),
    onSignedIn: vi.fn(),
    onShowSignIn: vi.fn(),
  };
  render(<Accept {...props} />);
  return { ...props, user: userEvent.setup() };
}

describe('P1-04: Accept screen', () => {
  it('P1-04: asks the server about the link in the URL', async () => {
    const { inviteDetails } = setup();
    await screen.findByRole('heading');
    expect(inviteDetails).toHaveBeenCalledWith({ token: 'tok-abc' });
  });

  it('P1-04: shows who invited them, the household, the note and the access level', async () => {
    setup();

    expect(
      await screen.findByRole('heading', { name: 'Sam invited you to The Examples' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Welcome aboard!')).toBeInTheDocument();
    expect(screen.getByText('View only')).toBeInTheDocument();
  });

  it('P1-04: says Full access for a full invite', async () => {
    setup({ details: () => Promise.resolve({ ...DETAILS, role: 'full' }) });
    expect(await screen.findByText('Full access')).toBeInTheDocument();
  });

  it('P1-04: leaves the note out when there is none', async () => {
    setup({ details: () => Promise.resolve({ ...DETAILS, note: '' }) });
    await screen.findByRole('heading', { name: /invited you/ });
    expect(screen.queryByText('Welcome aboard!')).not.toBeInTheDocument();
    expect(screen.queryByText(/note/i)).not.toBeInTheDocument();
  });

  it('P1-04: prefills the name and the invited email, and the email can be changed', async () => {
    const { user } = setup();
    const email = await screen.findByLabelText('Email');
    expect(email).toHaveValue('pat@example.com');
    expect(screen.getByLabelText('First name')).toHaveValue('Pat');

    await user.clear(email);
    await user.type(email, 'pat.own@example.com');
    expect(email).toHaveValue('pat.own@example.com');
  });

  it('P1-04: joining creates the login, signs in and continues', async () => {
    const { user, acceptInvite, auth, onSignedIn } = setup();
    const email = await screen.findByLabelText('Email');
    await user.clear(email);
    await user.type(email, 'Pat.Own@example.com');
    await user.type(screen.getByLabelText('Password'), 'abcd1234');
    await user.click(screen.getByRole('button', { name: 'Join household' }));

    expect(acceptInvite).toHaveBeenCalledWith({
      token: 'tok-abc',
      name: 'Pat',
      email: 'pat.own@example.com',
      password: 'abcd1234',
    });
    await vi.waitFor(() => expect(onSignedIn).toHaveBeenCalledOnce());
    expect(auth.signIn).toHaveBeenCalledWith('pat.own@example.com', 'abcd1234', false);
  });

  it('P1-04: shows a 4-step strength meter for the password', async () => {
    const { user } = setup();
    await screen.findByLabelText('Password');
    expect(screen.getByRole('meter', { name: 'Password strength' })).toHaveAttribute(
      'aria-valuenow',
      '0',
    );
    await user.type(screen.getByLabelText('Password'), 'Abcd1234!xyz');
    expect(screen.getByRole('meter', { name: 'Password strength' })).not.toHaveAttribute(
      'aria-valuenow',
      '0',
    );
  });

  it('P1-04: a password under 8 characters is explained and nothing is sent', async () => {
    const { user, acceptInvite } = setup();
    await user.type(await screen.findByLabelText('Password'), 'abc1234');
    await user.click(screen.getByRole('button', { name: 'Join household' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your password needs at least 8 characters.',
    );
    expect(acceptInvite).not.toHaveBeenCalled();
  });

  it('P1-04: an expired or used link shows an error and no form', async () => {
    setup({
      details: () =>
        Promise.reject(trpcError('NOT_FOUND', 'This invite link has expired or was already used.')),
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This invite link has expired or was already used.',
    );
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
    expect(screen.getByText(/Ask .* to send a new invite/i)).toBeInTheDocument();
  });

  it('P1-04: an expired link offers sign-in for people who already have an account', async () => {
    const { user, onShowSignIn } = setup({
      details: () => Promise.reject(trpcError('NOT_FOUND', 'gone')),
    });
    await user.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(onShowSignIn).toHaveBeenCalled();
  });

  it('P1-04: a network failure while loading shows the generic error', async () => {
    setup({ details: () => Promise.reject(new Error('offline')) });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
  });

  it('P1-04: a refused login shows the server reason and stays on the form', async () => {
    const { user, onSignedIn } = setup({
      acceptInvite: () => Promise.reject(trpcError('CONFLICT', "We couldn't create that login.")),
    });
    await user.type(await screen.findByLabelText('Password'), 'abcd1234');
    await user.click(screen.getByRole('button', { name: 'Join household' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't create that login.");
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it('P1-04: if sign-in fails after joining, they are sent to sign in', async () => {
    const { user, onShowSignIn, onSignedIn } = setup({
      signIn: () => Promise.reject(new Error('nope')),
    });
    await user.type(await screen.findByLabelText('Password'), 'abcd1234');
    await user.click(screen.getByRole('button', { name: 'Join household' }));

    await vi.waitFor(() => expect(onShowSignIn).toHaveBeenCalledOnce());
    expect(onSignedIn).not.toHaveBeenCalled();
  });
});
