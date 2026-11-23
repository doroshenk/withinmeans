import { signUpInput, type SignUpInput } from '@withinmeans/domain';
import { useState, type FormEvent } from 'react';
import { authErrorMessage } from '../auth/errors';
import { passwordStrength } from '../auth/strength';
import type { AuthClient } from '../auth/types';
import { AuthLayout } from './AuthLayout';

export interface SignUpProps {
  auth: AuthClient;
  /** Creates the login, household and owner membership (the API's `signUp`). */
  signUp: (input: SignUpInput) => Promise<unknown>;
  /** Signed in and ready for the setup wizard. */
  onSignedIn: () => void;
  onShowSignIn: () => void;
  /** The household time zone comes from the browser. */
  timeZone?: string;
}

type Step = 'who' | 'login' | 'done';
type Mode = SignUpInput['mode'];

const MODES: { mode: Mode; title: string; blurb: string }[] = [
  { mode: 'solo', title: 'Just me', blurb: 'One login. Your bills, income and investments.' },
  {
    mode: 'partner',
    title: 'Me and a partner',
    blurb:
      'One shared household — the same bills, accounts and investments — with a separate login for each of you.',
  },
];

function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function SignUp({
  auth,
  signUp,
  onSignedIn,
  onShowSignIn,
  timeZone = browserTimeZone(),
}: SignUpProps) {
  const [step, setStep] = useState<Step>('who');
  const [mode, setMode] = useState<Mode>('solo');
  const [password, setPassword] = useState('');
  const [created, setCreated] = useState<{ name: string; email: string; password: string }>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const strength = passwordStrength(password);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = signUpInput.safeParse({
      mode,
      name: String(form.get('name')),
      email: String(form.get('email')),
      password,
      timeZone,
      ...(mode === 'partner' ? { householdName: String(form.get('householdName')) } : {}),
    });
    if (!parsed.success) {
      // Partner mode asks for the household name first, so its message wins.
      const issues = parsed.error.issues;
      setError((issues.find((i) => i.path[0] === 'householdName') ?? issues[0])?.message);
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await signUp(parsed.data);
      setCreated({ name: parsed.data.name, email: parsed.data.email, password });
      setStep('done');
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function startSetup() {
    if (created === undefined) return;
    try {
      await auth.signIn(created.email, created.password, false);
      onSignedIn();
    } catch {
      onShowSignIn();
    }
  }

  if (step === 'who') {
    return (
      <AuthLayout>
        <div className="form">
          <p className="stepper">Step 1 of 3</p>
          <h1>Who&apos;s managing the money?</h1>
          <div role="radiogroup" aria-label="Who is managing the money" className="modes">
            {MODES.map((option) => (
              <label key={option.mode} className={mode === option.mode ? 'mode on' : 'mode'}>
                <input
                  type="radio"
                  name="mode"
                  value={option.mode}
                  checked={mode === option.mode}
                  onChange={() => setMode(option.mode)}
                />
                <span>
                  <strong>{option.title}</strong>
                  <span>{option.blurb}</span>
                </span>
              </label>
            ))}
          </div>
          <button type="button" className="button" onClick={() => setStep('login')}>
            Continue
          </button>
          <p className="switch">
            Already have an account?{' '}
            <button type="button" className="link" onClick={onShowSignIn}>
              Sign in
            </button>
          </p>
        </div>
      </AuthLayout>
    );
  }

  if (step === 'done' && created !== undefined) {
    return (
      <AuthLayout>
        <div className="form">
          <p className="stepper">Step 3 of 3</p>
          <h1>You&apos;re in, {created.name}</h1>
          <p>Your household is ready. Next, a few quick questions to set it up.</p>
          <button type="button" className="button" onClick={() => void startSetup()}>
            Start setting up
          </button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <form onSubmit={(e) => void submit(e)} className="form" noValidate>
        <p className="stepper">Step 2 of 3</p>
        <h1>Create your login</h1>
        {mode === 'partner' && (
          <label>
            Household name
            <input name="householdName" autoComplete="off" required />
          </label>
        )}
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
          {[1, 2, 3, 4].map((n) => (
            <span key={n} className={n <= strength ? 'meter-step on' : 'meter-step'} />
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
        <button type="button" className="button button-quiet" onClick={() => setStep('who')}>
          Back
        </button>
      </form>
    </AuthLayout>
  );
}
