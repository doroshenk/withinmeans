import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AuthClient } from '../auth/types';
import { SignUp } from './SignUp';

const PENDING = {
  id: 'inv-1',
  name: 'Pat',
  email: 'pat@example.com',
  status: 'pending' as const,
  daysLeft: 7,
};

function setup(
  over: {
    invitePartner?: (input: unknown) => Promise<typeof PENDING>;
    resendInvite?: (input: { inviteId: string }) => Promise<typeof PENDING>;
  } = {},
) {
  const auth: AuthClient = {
    signIn: vi.fn(() => Promise.resolve()),
    signOut: vi.fn(),
    getAccessToken: vi.fn(() => Promise.resolve(undefined)),
  };
  const props = {
    auth,
    signUp: vi.fn(() => Promise.resolve({})),
    invitePartner: vi.fn(over.invitePartner ?? (() => Promise.resolve(PENDING))),
    resendInvite: vi.fn(over.resendInvite ?? (() => Promise.resolve(PENDING))),
    onSignedIn: vi.fn(),
    onShowSignIn: vi.fn(),
    timeZone: 'America/Chicago',
  };
  render(<SignUp {...props} />);
  return { ...props, user: userEvent.setup() };
}

type User = ReturnType<typeof setup>['user'];

async function reachInviteStep(user: User) {
  await user.click(screen.getByRole('radio', { name: /Me and a partner/ }));
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await user.type(screen.getByLabelText('Household name'), 'The Examples');
  await user.type(screen.getByLabelText('First name'), 'Sam');
  await user.type(screen.getByLabelText('Email'), 'sam@example.com');
  await user.type(screen.getByLabelText('Password'), 'abcd1234');
  await user.click(screen.getByRole('button', { name: 'Create account' }));
  await screen.findByRole('heading', { name: 'Invite your partner' });
}

async function fillPartner(user: User, email = 'pat@example.com') {
  await user.type(screen.getByLabelText("Partner's first name"), 'Pat');
  await user.type(screen.getByLabelText("Partner's email"), email);
}

const send = (user: User) =>
  user.click(screen.getByRole('button', { name: 'Send invite & finish' }));

describe('SignUp: invite your partner (step 3, partner mode only)', () => {
  it("P1-03: after the login is created the user is signed in and asked for the partner's details", async () => {
    const { user, auth } = setup();
    await reachInviteStep(user);

    expect(auth.signIn).toHaveBeenCalledWith('sam@example.com', 'abcd1234', false);
    expect(screen.getByText('Step 3 of 4')).toBeInTheDocument();
    expect(screen.getByLabelText("Partner's first name")).toBeInTheDocument();
    expect(screen.getByLabelText("Partner's email")).toBeInTheDocument();
    expect(screen.getByLabelText('Note (optional)')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Full access/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /View only/ })).not.toBeChecked();
  });

  it('P1-03: there is no "invite later" path: only Send invite & finish and Back', async () => {
    const { user } = setup();
    await reachInviteStep(user);

    const buttons = screen.getAllByRole('button').map((b) => b.textContent);
    expect(buttons).toEqual(['Send invite & finish', 'Back']);
    expect(document.body).not.toHaveTextContent(/later|skip/i);
  });

  it('P1-03: the flow cannot finish without sending: empty fields and a failed send stay on this step', async () => {
    const { user, invitePartner } = setup({ invitePartner: () => Promise.reject(new Error('x')) });
    await reachInviteStep(user);

    await send(user);
    expect(await screen.findByRole('alert')).toHaveTextContent("Enter your partner's first name.");
    expect(invitePartner).not.toHaveBeenCalled();

    await fillPartner(user);
    await send(user);

    expect(await screen.findByText('Something went wrong. Please try again.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Invite your partner' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: "You're in, Sam" })).not.toBeInTheDocument();
  });

  it('T19: the user\'s own email is rejected with "Use your partner\'s own email…" before anything is sent', async () => {
    const { user, invitePartner } = setup();
    await reachInviteStep(user);
    await fillPartner(user, 'SAM@example.com');

    await send(user);

    expect(await screen.findByRole('alert')).toHaveTextContent("Use your partner's own email");
    expect(invitePartner).not.toHaveBeenCalled();
  });

  it('P1-03: a reason the server gives (a rule the screen could not check) is shown as it is', async () => {
    const rejected = Object.assign(new Error('An invite is already waiting. Resend it instead.'), {
      name: 'TRPCClientError',
      data: { code: 'CONFLICT' },
    });
    const { user } = setup({ invitePartner: () => Promise.reject(rejected) });
    await reachInviteStep(user);
    await fillPartner(user);

    await send(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'An invite is already waiting. Resend it instead.',
    );
  });

  it('P1-03: sends the name, email, access level and note', async () => {
    const { user, invitePartner } = setup();
    await reachInviteStep(user);
    await fillPartner(user);
    await user.click(screen.getByRole('radio', { name: /View only/ }));
    await user.type(screen.getByLabelText('Note (optional)'), 'Welcome!');

    await send(user);

    expect(invitePartner).toHaveBeenCalledWith({
      name: 'Pat',
      email: 'pat@example.com',
      role: 'view',
      note: 'Welcome!',
    });
  });

  it('P1-03: Back returns to the login step', async () => {
    const { user } = setup();
    await reachInviteStep(user);
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('heading', { name: 'Create your login' })).toBeInTheDocument();
  });

  it('P1-03: if signing in after sign-up fails the user is sent to the sign-in screen', async () => {
    const { user, auth, onShowSignIn } = setup();
    vi.mocked(auth.signIn).mockRejectedValueOnce(new Error('later'));
    await user.click(screen.getByRole('radio', { name: /Me and a partner/ }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.type(screen.getByLabelText('Household name'), 'The Examples');
    await user.type(screen.getByLabelText('First name'), 'Sam');
    await user.type(screen.getByLabelText('Email'), 'sam@example.com');
    await user.type(screen.getByLabelText('Password'), 'abcd1234');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    await vi.waitFor(() => expect(onShowSignIn).toHaveBeenCalledOnce());
  });
});

describe('SignUp: done, partner mode (step 4)', () => {
  async function sent(user: User) {
    await reachInviteStep(user);
    await fillPartner(user);
    await send(user);
    await screen.findByRole('heading', { name: "You're in, Sam" });
  }

  it('P1-03: shows the pending invite and when it expires', async () => {
    const { user } = setup();
    await sent(user);

    expect(screen.getByText('Step 4 of 4')).toBeInTheDocument();
    expect(screen.getByText(/Invite sent to Pat/)).toHaveTextContent('pat@example.com');
    expect(screen.getByText('Pending · expires in 7 days')).toBeInTheDocument();
  });

  it('P1-03: Resend sends the invite again and says so', async () => {
    const { user, resendInvite } = setup();
    await sent(user);

    await user.click(screen.getByRole('button', { name: 'Resend' }));

    expect(resendInvite).toHaveBeenCalledWith({ inviteId: 'inv-1' });
    expect(await screen.findByText('Invite re-sent.')).toBeInTheDocument();
  });

  it('P1-03: a failed Resend says so and the invite stays pending', async () => {
    const { user } = setup({ resendInvite: () => Promise.reject(new Error('nope')) });
    await sent(user);

    await user.click(screen.getByRole('button', { name: 'Resend' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    expect(screen.getByText('Pending · expires in 7 days')).toBeInTheDocument();
  });

  it('P1-03: Start setting up continues; the user is already signed in', async () => {
    const { user, auth, onSignedIn } = setup();
    await sent(user);

    await user.click(screen.getByRole('button', { name: 'Start setting up' }));

    expect(onSignedIn).toHaveBeenCalledOnce();
    expect(auth.signIn).toHaveBeenCalledTimes(1);
  });

  it('P1-03: one day left reads in the singular', async () => {
    const { user } = setup({ invitePartner: () => Promise.resolve({ ...PENDING, daysLeft: 1 }) });
    await sent(user);
    expect(screen.getByText('Pending · expires in 1 day')).toBeInTheDocument();
  });
});
