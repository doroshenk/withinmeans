import {
  invitePartnerInput,
  partnerEmailProblem,
  signUpInput,
  type InvitePartnerInput,
  type SignUpInput,
} from '@withinmeans/domain';
import { useState, type FormEvent } from 'react';
import { apiErrorMessage, authErrorMessage, GENERIC_ERROR } from '../auth/errors';
import { passwordStrength } from '../auth/strength';
import type { AuthClient } from '../auth/types';
import { AuthLayout } from './AuthLayout';

export interface PendingInvite {
  id: string;
  name: string;
  email: string;
  status: 'pending';
  daysLeft: number;
}

export interface SignUpProps {
  auth: AuthClient;
  /** Creates the login, household and owner membership (the API's `signUp`). */
  signUp: (input: SignUpInput) => Promise<unknown>;
  /** Partner mode only: invites the partner (the API's `invitePartner`). */
  invitePartner: (input: InvitePartnerInput) => Promise<PendingInvite>;
  /** Sends the pending invite again with a new link (the API's `resendInvite`). */
  resendInvite: (input: { inviteId: string }) => Promise<PendingInvite>;
  /** Signed in and ready for the setup wizard. */
  onSignedIn: () => void;
  onShowSignIn: () => void;
  /** The household time zone comes from the browser. */
  timeZone?: string;
}

type Step = 'who' | 'login' | 'invite' | 'done';
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

const ROLES: { role: InvitePartnerInput['role']; title: string; blurb: string }[] = [
  { role: 'full', title: 'Full access', blurb: 'Add, edit and delete anything.' },
  { role: 'view', title: 'View only', blurb: 'See everything, change nothing.' },
];

const daysText = (n: number): string => `${String(n)} ${n === 1 ? 'day' : 'days'}`;

function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function SignUp({
  auth,
  signUp,
  invitePartner,
  resendInvite,
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
  const [role, setRole] = useState<InvitePartnerInput['role']>('full');
  const [invite, setInvite] = useState<PendingInvite>();
  const [resent, setResent] = useState(false);
  // Partner mode has one more step (spec section 3), so its stepper counts four.
  const total = mode === 'partner' ? 4 : 3;
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
      if (mode === 'partner') {
        // Inviting needs a signed-in user, so sign in now, before asking for the partner.
        try {
          await auth.signIn(parsed.data.email, password, false);
        } catch {
          onShowSignIn();
          return;
        }
        setStep('invite');
      } else {
        setStep('done');
      }
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function sendInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (created === undefined) return;
    const form = new FormData(event.currentTarget);
    const parsed = invitePartnerInput.safeParse({
      name: String(form.get('partnerName')),
      email: String(form.get('partnerEmail')),
      role,
      note: String(form.get('note')),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    const problem = partnerEmailProblem(created.email, parsed.data.email);
    if (problem !== undefined) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      setInvite(await invitePartner(parsed.data));
      setStep('done');
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (invite === undefined) return;
    setError(undefined);
    setResent(false);
    try {
      setInvite(await resendInvite({ inviteId: invite.id }));
      setResent(true);
    } catch {
      setError(GENERIC_ERROR);
    }
  }

  async function startSetup() {
    if (created === undefined) return;
    // A partner is already signed in: the invite step needed it.
    if (mode === 'partner') {
      onSignedIn();
      return;
    }
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
          <p className="stepper">Step 1 of {total}</p>
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

  if (step === 'invite') {
    return (
      <AuthLayout>
        <form key="invite" onSubmit={(e) => void sendInvite(e)} className="form" noValidate>
          <p className="stepper">Step 3 of {total}</p>
          <h1>Invite your partner</h1>
          <p>They get their own login and see the same household.</p>
          <label>
            Partner&apos;s first name
            <input name="partnerName" autoComplete="off" required />
          </label>
          <label>
            Partner&apos;s email
            <input name="partnerEmail" type="email" autoComplete="off" required />
          </label>
          <div role="radiogroup" aria-label="Access level" className="modes">
            {ROLES.map((option) => (
              <label key={option.role} className={role === option.role ? 'mode on' : 'mode'}>
                <input
                  type="radio"
                  name="role"
                  value={option.role}
                  checked={role === option.role}
                  onChange={() => setRole(option.role)}
                />
                <span>
                  <strong>{option.title}</strong>
                  <span>{option.blurb}</span>
                </span>
              </label>
            ))}
          </div>
          <label>
            Note (optional)
            <textarea name="note" rows={3} maxLength={500} />
          </label>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button type="submit" className="button" disabled={busy}>
            Send invite &amp; finish
          </button>
          <button
            type="button"
            className="button button-quiet"
            onClick={() => {
              setError(undefined);
              setStep('login');
            }}
          >
            Back
          </button>
        </form>
      </AuthLayout>
    );
  }

  if (step === 'done' && created !== undefined) {
    return (
      <AuthLayout>
        <div className="form">
          <p className="stepper">
            Step {total} of {total}
          </p>
          <h1>You&apos;re in, {created.name}</h1>
          <p>Your household is ready. Next, a few quick questions to set it up.</p>
          {invite !== undefined && (
            <div className="invite-status">
              <p>
                Invite sent to {invite.name} ({invite.email})
              </p>
              <p>{`Pending · expires in ${daysText(invite.daysLeft)}`}</p>
              <button type="button" className="button button-quiet" onClick={() => void resend()}>
                Resend
              </button>
              {resent && <p role="status">Invite re-sent.</p>}
              {error && (
                <p role="alert" className="error">
                  {error}
                </p>
              )}
            </div>
          )}
          <button type="button" className="button" onClick={() => void startSetup()}>
            Start setting up
          </button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <form key="login" onSubmit={(e) => void submit(e)} className="form" noValidate>
        <p className="stepper">Step 2 of {total}</p>
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
