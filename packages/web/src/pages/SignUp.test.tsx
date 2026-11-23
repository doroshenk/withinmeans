import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AuthClient } from '../auth/types';
import { SignUp } from './SignUp';

function fakeAuth(): AuthClient {
  return {
    signIn: vi.fn(() => Promise.resolve()),
    signOut: vi.fn(),
    getAccessToken: vi.fn(() => Promise.resolve(undefined)),
  };
}

const PENDING = {
  id: 'inv-1',
  name: 'Pat',
  email: 'pat@example.com',
  status: 'pending' as const,
  daysLeft: 7,
};

function setup(signUp: (input: unknown) => Promise<unknown> = () => Promise.resolve({})) {
  const auth = fakeAuth();
  const props = {
    auth,
    signUp: vi.fn(signUp),
    invitePartner: vi.fn(() => Promise.resolve(PENDING)),
    resendInvite: vi.fn(() => Promise.resolve(PENDING)),
    onSignedIn: vi.fn(),
    onShowSignIn: vi.fn(),
    timeZone: 'America/Chicago',
  };
  render(<SignUp {...props} />);
  return { ...props, user: userEvent.setup() };
}

type User = ReturnType<typeof setup>['user'];

async function choose(user: User, mode: 'Just me' | 'Me and a partner') {
  await user.click(screen.getByRole('radio', { name: new RegExp(mode) }));
  await user.click(screen.getByRole('button', { name: 'Continue' }));
}

async function fillLogin(user: User, password = 'abcd1234') {
  await user.type(screen.getByLabelText('First name'), 'Sam');
  await user.type(screen.getByLabelText('Email'), 'sam@example.com');
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Create account' }));
}

describe('SignUp: who is managing the money (step 1)', () => {
  it('P1-02: offers Just me and Me and a partner, then continues to the login form', async () => {
    const { user } = setup();
    expect(screen.getByRole('heading', { name: "Who's managing the money?" })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Just me/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Me and a partner/ })).toBeInTheDocument();

    await choose(user, 'Just me');

    expect(screen.getByRole('heading', { name: 'Create your login' })).toBeInTheDocument();
  });

  it('P1-02: links to sign in', async () => {
    const { user, onShowSignIn } = setup();
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(onShowSignIn).toHaveBeenCalledOnce();
  });
});

describe('SignUp: create your login (step 2)', () => {
  it('P1-02: asks for a household name only in partner mode', async () => {
    const { user } = setup();
    await choose(user, 'Just me');
    expect(screen.queryByLabelText('Household name')).not.toBeInTheDocument();
  });

  it('P1-02: partner mode asks for the household name and requires it', async () => {
    const { user, signUp } = setup();
    await choose(user, 'Me and a partner');
    expect(screen.getByLabelText('Household name')).toBeInTheDocument();

    await fillLogin(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('Give your household a name.');
    expect(signUp).not.toHaveBeenCalled();
  });

  it('P1-02: password under 8 characters is rejected before anything is sent', async () => {
    const { user, signUp } = setup();
    await choose(user, 'Just me');

    await fillLogin(user, 'abc1234');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your password needs at least 8 characters.',
    );
    expect(signUp).not.toHaveBeenCalled();
  });

  it('P1-02: the password strength meter has 4 steps', async () => {
    const { user } = setup();
    await choose(user, 'Just me');
    const meter = screen.getByRole('meter', { name: 'Password strength' });
    expect(meter).toHaveAttribute('aria-valuemax', '4');
    expect(meter).toHaveAttribute('aria-valuenow', '0');
    expect(meter.querySelectorAll('.meter-step')).toHaveLength(4);

    await user.type(screen.getByLabelText('Password'), 'correct horse 42');

    expect(meter).toHaveAttribute('aria-valuenow', '4');
  });

  it('P1-02: Back returns to step 1', async () => {
    const { user } = setup();
    await choose(user, 'Just me');
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('heading', { name: "Who's managing the money?" })).toBeInTheDocument();
  });

  it('P1-02: sends the choice, details and the browser time zone', async () => {
    const { user, signUp } = setup();
    await choose(user, 'Just me');

    await fillLogin(user);

    expect(signUp).toHaveBeenCalledWith({
      mode: 'solo',
      name: 'Sam',
      email: 'sam@example.com',
      password: 'abcd1234',
      timeZone: 'America/Chicago',
    });
  });

  it('P1-02: partner mode also sends the household name', async () => {
    const { user, signUp } = setup();
    await choose(user, 'Me and a partner');
    await user.type(screen.getByLabelText('Household name'), 'The Examples');

    await fillLogin(user);

    expect(signUp).toHaveBeenCalledWith({
      mode: 'partner',
      householdName: 'The Examples',
      name: 'Sam',
      email: 'sam@example.com',
      password: 'abcd1234',
      timeZone: 'America/Chicago',
    });
  });

  it('P1-02: a failure shows a generic alert and stays on the form', async () => {
    const { user } = setup(() => Promise.reject(new Error('nope')));
    await choose(user, 'Just me');

    await fillLogin(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
    expect(screen.getByRole('heading', { name: 'Create your login' })).toBeInTheDocument();
  });
});

describe('SignUp: done (step 4)', () => {
  it("P1-02: shows You're in, then Start setting up signs in and continues", async () => {
    const { user, auth, onSignedIn } = setup();
    await choose(user, 'Just me');
    await fillLogin(user);

    expect(await screen.findByRole('heading', { name: "You're in, Sam" })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start setting up' }));

    expect(auth.signIn).toHaveBeenCalledWith('sam@example.com', 'abcd1234', false);
    expect(onSignedIn).toHaveBeenCalledOnce();
  });

  it('P1-02: if signing in fails the user is sent to the sign-in screen', async () => {
    const { user, auth, onShowSignIn, onSignedIn } = setup();
    vi.mocked(auth.signIn).mockRejectedValueOnce(new Error('later'));
    await choose(user, 'Just me');
    await fillLogin(user);
    await user.click(await screen.findByRole('button', { name: 'Start setting up' }));

    expect(onShowSignIn).toHaveBeenCalledOnce();
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it('T20: a solo account never shows a partner invite option anywhere', async () => {
    const { user } = setup();
    await choose(user, 'Just me');
    // The pitch panel on the left mentions partners in general; what must never appear is an
    // invite, a partner field or a partner choice.
    const noPartnerOptions = () => {
      expect(document.body).not.toHaveTextContent(/invite/i);
      expect(screen.queryByLabelText(/partner|household name/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('radio', { name: /partner/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /partner|invite/i })).not.toBeInTheDocument();
    };
    noPartnerOptions();

    await fillLogin(user);
    await screen.findByRole('heading', { name: "You're in, Sam" });

    noPartnerOptions();
  });
});
