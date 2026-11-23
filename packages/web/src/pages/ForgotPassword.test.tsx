import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AuthClient } from '../auth/types';
import { ForgotPassword } from './ForgotPassword';

const cognitoError = (name: string) => Object.assign(new Error('x'), { name });

function setup(over: Partial<Pick<AuthClient, 'forgotPassword' | 'resetPassword'>> = {}) {
  const auth: AuthClient = {
    signIn: vi.fn(() => Promise.resolve()),
    forgotPassword: vi.fn(over.forgotPassword ?? (() => Promise.resolve())),
    resetPassword: vi.fn(over.resetPassword ?? (() => Promise.resolve())),
    signOut: vi.fn(),
    getAccessToken: vi.fn(() => Promise.resolve(undefined)),
  };
  const onBack = vi.fn();
  render(<ForgotPassword auth={auth} onBack={onBack} />);
  return { auth, onBack, user: userEvent.setup() };
}

async function requestCode(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Email'), 'sam@example.com');
  await user.click(screen.getByRole('button', { name: 'Send code' }));
}

async function enterCode(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText('Code'), '123456');
  await user.type(screen.getByLabelText('New password'), 'abcd1234');
  await user.click(screen.getByRole('button', { name: 'Change password' }));
}

describe('ForgotPassword', () => {
  it('P1-05: code sent: asks Cognito, says "if that email has an account", asks for the code', async () => {
    const { auth, user } = setup();

    await requestCode(user);

    expect(auth.forgotPassword).toHaveBeenCalledWith('sam@example.com');
    expect(await screen.findByRole('status')).toHaveTextContent(
      "If that email has an account, we've sent a code.",
    );
    expect(screen.getByLabelText('Code')).toBeInTheDocument();
  });

  it('P1-05: never reveals whether the email has an account (unknown user reads the same)', async () => {
    const { user } = setup({
      forgotPassword: () => Promise.reject(cognitoError('UserNotFoundException')),
    });

    await requestCode(user);

    expect(await screen.findByRole('status')).toHaveTextContent('If that email has an account');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('P1-05: too many requests shows a wait message and stays on the email step', async () => {
    const { user } = setup({
      forgotPassword: () => Promise.reject(cognitoError('LimitExceededException')),
    });

    await requestCode(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts');
    expect(screen.queryByLabelText('Code')).not.toBeInTheDocument();
  });

  it('P1-05: success: sends email, code and new password, then offers sign-in', async () => {
    const { auth, onBack, user } = setup();
    await requestCode(user);

    await enterCode(user);

    expect(auth.resetPassword).toHaveBeenCalledWith('sam@example.com', '123456', 'abcd1234');
    expect(await screen.findByRole('status')).toHaveTextContent('Password changed');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('P1-05: wrong code shows a clear message and lets the user try again', async () => {
    const { user } = setup({
      resetPassword: () => Promise.reject(cognitoError('CodeMismatchException')),
    });
    await requestCode(user);

    await enterCode(user);

    expect(await screen.findByRole('alert')).toHaveTextContent("That code isn't right");
    expect(screen.getByLabelText('Code')).toBeInTheDocument();
  });

  it('P1-05: an expired code says so', async () => {
    const { user } = setup({
      resetPassword: () => Promise.reject(cognitoError('ExpiredCodeException')),
    });
    await requestCode(user);

    await enterCode(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('expired');
  });

  it('P1-05: a password Cognito rejects asks for a stronger one', async () => {
    const { user } = setup({
      resetPassword: () => Promise.reject(cognitoError('InvalidPasswordException')),
    });
    await requestCode(user);

    await enterCode(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('stronger password');
  });

  it('can go back to sign-in', async () => {
    const { onBack, user } = setup();

    await user.click(screen.getByRole('button', { name: 'Back to sign in' }));

    expect(onBack).toHaveBeenCalledOnce();
  });
});
