import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AuthClient } from '../auth/types';
import { SignUp } from './SignUp';

function fakeAuth(signUp: AuthClient['signUp']): AuthClient {
  return {
    signIn: vi.fn(),
    signUp,
    signOut: vi.fn(),
    getAccessToken: vi.fn(() => Promise.resolve(undefined)),
  };
}

async function fill(user: ReturnType<typeof userEvent.setup>, password: string) {
  await user.type(screen.getByLabelText('First name'), 'Sam');
  await user.type(screen.getByLabelText('Email'), 'sam@example.com');
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Create account' }));
}

describe('SignUp', () => {
  it('needs at least 8 characters in the password', async () => {
    const user = userEvent.setup();
    const signUp = vi.fn(() => Promise.resolve());
    render(<SignUp auth={fakeAuth(signUp)} onSignedUp={vi.fn()} onShowSignIn={vi.fn()} />);

    await fill(user, 'abc1234');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your password needs at least 8 characters.',
    );
    expect(signUp).not.toHaveBeenCalled();
  });

  it('sends the name, email and password once the password is long enough', async () => {
    const user = userEvent.setup();
    const signUp = vi.fn(() => Promise.resolve());
    const onSignedUp = vi.fn();
    render(<SignUp auth={fakeAuth(signUp)} onSignedUp={onSignedUp} onShowSignIn={vi.fn()} />);

    await fill(user, 'abcd1234');

    expect(signUp).toHaveBeenCalledWith({
      name: 'Sam',
      email: 'sam@example.com',
      password: 'abcd1234',
    });
    expect(onSignedUp).toHaveBeenCalledOnce();
  });

  it('shows a failure with role="alert"', async () => {
    const user = userEvent.setup();
    const signUp = vi.fn(() => Promise.reject(new Error('nope')));
    render(<SignUp auth={fakeAuth(signUp)} onSignedUp={vi.fn()} onShowSignIn={vi.fn()} />);

    await fill(user, 'abcd1234');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
  });

  it('shows the 4-step strength meter as the user types', async () => {
    const user = userEvent.setup();
    render(
      <SignUp
        auth={fakeAuth(() => Promise.resolve())}
        onSignedUp={vi.fn()}
        onShowSignIn={vi.fn()}
      />,
    );
    const meter = screen.getByRole('meter', { name: 'Password strength' });
    expect(meter).toHaveAttribute('aria-valuemax', '4');
    expect(meter).toHaveAttribute('aria-valuenow', '0');

    await user.type(screen.getByLabelText('Password'), 'correct horse 42');

    expect(meter).toHaveAttribute('aria-valuenow', '4');
  });

  it('links back to sign in', async () => {
    const user = userEvent.setup();
    const onShowSignIn = vi.fn();
    render(
      <SignUp
        auth={fakeAuth(() => Promise.resolve())}
        onSignedUp={vi.fn()}
        onShowSignIn={onShowSignIn}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(onShowSignIn).toHaveBeenCalledOnce();
  });
});
