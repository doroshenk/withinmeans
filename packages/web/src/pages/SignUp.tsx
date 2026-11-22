import { useState, type FormEvent } from 'react';
import { authErrorMessage } from '../auth/errors';
import { MIN_PASSWORD_LENGTH, passwordStrength } from '../auth/strength';
import type { AuthClient } from '../auth/types';
import { AuthLayout } from './AuthLayout';

export interface SignUpProps {
  auth: AuthClient;
  onSignedUp: () => void;
  onShowSignIn: () => void;
}

export function SignUp({ auth, onSignedUp, onShowSignIn }: SignUpProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const strength = passwordStrength(password);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Your password needs at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await auth.signUp({
        name: String(form.get('name')),
        email: String(form.get('email')),
        password,
      });
      onSignedUp();
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <form onSubmit={(e) => void submit(e)} className="form" noValidate>
        <h1>Create your login</h1>
        <label>
          First name
          <input name="name" autoComplete="given-name" required />
        </label>
        <label>
          Email
          <input name="email" type="email" autoComplete="username" required />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <div
          role="meter"
          aria-label="Password strength"
          aria-valuemin={0}
          aria-valuemax={4}
          aria-valuenow={strength}
          className="meter"
        >
          {[1, 2, 3, 4].map((step) => (
            <span key={step} className={step <= strength ? 'meter-step on' : 'meter-step'} />
          ))}
        </div>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button type="submit" className="button" disabled={busy}>
          Create account
        </button>
        <p className="switch">
          Already have an account?{' '}
          <button type="button" className="link" onClick={onShowSignIn}>
            Sign in
          </button>
        </p>
      </form>
    </AuthLayout>
  );
}
