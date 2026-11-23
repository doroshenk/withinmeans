import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AuthClient } from '../auth/types';
import { SignIn } from './SignIn';

function fakeAuth(signIn: AuthClient['signIn']): AuthClient {
  return {
    signIn,
    signOut: vi.fn(),
    forgotPassword: vi.fn(() => Promise.resolve()),
    resetPassword: vi.fn(() => Promise.resolve()),
    getAccessToken: vi.fn(() => Promise.resolve(undefined)),
  };
}

function cognitoError(name: string, message: string) {
  return Object.assign(new Error(message), { name });
}

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Email'), 'sam@example.com');
  await user.type(screen.getByLabelText('Password'), 'hunter22');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('SignIn', () => {
  it('shows Cognito errors with role="alert"', async () => {
    const user = userEvent.setup();
    const signIn = vi.fn(() =>
      Promise.reject(cognitoError('NotAuthorizedException', 'Incorrect username or password.')),
    );
    render(
      <SignIn
        auth={fakeAuth(signIn)}
        onSignedIn={vi.fn()}
        onShowSignUp={vi.fn()}
        onForgotPassword={vi.fn()}
      />,
    );

    await fillAndSubmit(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect.');
  });

  it('never reveals whether an email has an account: unknown user reads the same', async () => {
    const user = userEvent.setup();
    const signIn = vi.fn(() =>
      Promise.reject(cognitoError('UserNotFoundException', 'User does not exist.')),
    );
    render(
      <SignIn
        auth={fakeAuth(signIn)}
        onSignedIn={vi.fn()}
        onShowSignUp={vi.fn()}
        onForgotPassword={vi.fn()}
      />,
    );

    await fillAndSubmit(user);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Email or password is incorrect.');
    expect(alert).not.toHaveTextContent(/exist/i);
  });

  it('shows a generic message for an error it does not recognise', async () => {
    const user = userEvent.setup();
    const signIn = vi.fn(() => Promise.reject(new Error('socket hang up')));
    render(
      <SignIn
        auth={fakeAuth(signIn)}
        onSignedIn={vi.fn()}
        onShowSignUp={vi.fn()}
        onForgotPassword={vi.fn()}
      />,
    );

    await fillAndSubmit(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
  });

  it('passes the email, password and "keep me signed in" choice to Cognito', async () => {
    const user = userEvent.setup();
    const signIn = vi.fn(() => Promise.resolve());
    const onSignedIn = vi.fn();
    render(
      <SignIn
        auth={fakeAuth(signIn)}
        onSignedIn={onSignedIn}
        onShowSignUp={vi.fn()}
        onForgotPassword={vi.fn()}
      />,
    );

    await user.click(screen.getByLabelText('Keep me signed in on this device'));
    await fillAndSubmit(user);

    expect(signIn).toHaveBeenCalledWith('sam@example.com', 'hunter22', true);
    expect(onSignedIn).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not keep the user signed in unless asked', async () => {
    const user = userEvent.setup();
    const signIn = vi.fn(() => Promise.resolve());
    render(
      <SignIn
        auth={fakeAuth(signIn)}
        onSignedIn={vi.fn()}
        onShowSignUp={vi.fn()}
        onForgotPassword={vi.fn()}
      />,
    );

    await fillAndSubmit(user);

    expect(signIn).toHaveBeenCalledWith('sam@example.com', 'hunter22', false);
  });

  it('links to create an account', async () => {
    const user = userEvent.setup();
    const onShowSignUp = vi.fn();
    render(
      <SignIn
        auth={fakeAuth(() => Promise.resolve())}
        onSignedIn={vi.fn()}
        onShowSignUp={onShowSignUp}
        onForgotPassword={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Create an account' }));

    expect(onShowSignUp).toHaveBeenCalledOnce();
  });

  it('links to forgot password', async () => {
    const user = userEvent.setup();
    const onForgotPassword = vi.fn();
    render(
      <SignIn
        auth={fakeAuth(() => Promise.resolve())}
        onSignedIn={vi.fn()}
        onShowSignUp={vi.fn()}
        onForgotPassword={onForgotPassword}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Forgot password?' }));

    expect(onForgotPassword).toHaveBeenCalledOnce();
  });
});
