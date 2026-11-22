import { useState, type FormEvent } from 'react';
import { authErrorMessage } from '../auth/errors';
import type { AuthClient } from '../auth/types';
import { AuthLayout } from './AuthLayout';

export interface SignInProps {
  auth: AuthClient;
  onSignedIn: () => void;
  onShowSignUp: () => void;
}

export function SignIn({ auth, onSignedIn, onShowSignUp }: SignInProps) {
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(undefined);
    try {
      await auth.signIn(
        String(form.get('email')),
        String(form.get('password')),
        form.get('keep') === 'on',
      );
      onSignedIn();
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <form onSubmit={(e) => void submit(e)} className="form">
        <h1>Welcome back</h1>
        <label>
          Email
          <input name="email" type="email" autoComplete="username" required />
        </label>
        <label>
          Password
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        <label className="check">
          <input name="keep" type="checkbox" />
          Keep me signed in on this device
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button type="submit" className="button" disabled={busy}>
          Sign in
        </button>
        <p className="switch">
          New here?{' '}
          <button type="button" className="link" onClick={onShowSignUp}>
            Create an account
          </button>
        </p>
      </form>
    </AuthLayout>
  );
}
