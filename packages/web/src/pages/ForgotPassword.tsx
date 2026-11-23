import { useState, type FormEvent } from 'react';
import { authErrorMessage } from '../auth/errors';
import type { AuthClient } from '../auth/types';
import { AuthLayout } from './AuthLayout';

export interface ForgotPasswordProps {
  auth: AuthClient;
  /** Back to the sign-in screen (cancel, or after the password is changed). */
  onBack: () => void;
}

type Step = 'email' | 'code' | 'done';

/** Errors that must look like success so the screen never reveals whether an email has an account. */
const LOOKS_LIKE_SUCCESS = new Set(['UserNotFoundException', 'InvalidParameterException']);

export function ForgotPassword({ auth, onBack }: ForgotPasswordProps) {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError(undefined);
    try {
      await work();
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function sendCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const address = String(new FormData(event.currentTarget).get('email'));
    void run(async () => {
      try {
        await auth.forgotPassword(address);
      } catch (err) {
        if (!(err instanceof Error && LOOKS_LIKE_SUCCESS.has(err.name))) throw err;
      }
      setEmail(address);
      setStep('code');
    });
  }

  function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run(async () => {
      await auth.resetPassword(email, String(form.get('code')), String(form.get('password')));
      setStep('done');
    });
  }

  const alert = error && (
    <p role="alert" className="error">
      {error}
    </p>
  );

  return (
    <AuthLayout>
      {step === 'email' && (
        <form onSubmit={sendCode} className="form">
          <h1>Reset your password</h1>
          <p>Enter your email and we&apos;ll send you a code.</p>
          <label>
            Email
            <input name="email" type="email" autoComplete="username" required />
          </label>
          {alert}
          <button type="submit" className="button" disabled={busy}>
            Send code
          </button>
          <button type="button" className="link" onClick={onBack}>
            Back to sign in
          </button>
        </form>
      )}
      {step === 'code' && (
        <form onSubmit={changePassword} className="form">
          <h1>Reset your password</h1>
          <p role="status">If that email has an account, we&apos;ve sent a code.</p>
          <label>
            Code
            <input name="code" inputMode="numeric" autoComplete="one-time-code" required />
          </label>
          <label>
            New password
            <input name="password" type="password" autoComplete="new-password" required />
          </label>
          {alert}
          <button type="submit" className="button" disabled={busy}>
            Change password
          </button>
          <button type="button" className="link" onClick={onBack}>
            Back to sign in
          </button>
        </form>
      )}
      {step === 'done' && (
        <div className="form">
          <h1>Reset your password</h1>
          <p role="status">Password changed. You can sign in with it now.</p>
          <button type="button" className="button" onClick={onBack}>
            Sign in
          </button>
        </div>
      )}
    </AuthLayout>
  );
}
