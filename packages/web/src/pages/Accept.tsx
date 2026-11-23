import { acceptInviteInput, type AcceptInviteInput } from '@withinmeans/domain';
import { useEffect, useState, type FormEvent } from 'react';
import { apiErrorMessage, GENERIC_ERROR } from '../auth/errors';
import { passwordStrength } from '../auth/strength';
import type { AuthClient } from '../auth/types';
import { AuthLayout } from './AuthLayout';

export interface InviteDetails {
  inviterName: string;
  householdName: string;
  inviteeName: string;
  email: string;
  role: 'full' | 'view';
  note: string;
}

export interface AcceptProps {
  auth: AuthClient;
  /** The secret from the invite link. */
  token: string;
  inviteDetails: (input: { token: string }) => Promise<InviteDetails>;
  acceptInvite: (input: AcceptInviteInput) => Promise<unknown>;
  onSignedIn: () => void;
  onShowSignIn: () => void;
}

type Loaded =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; invite: InviteDetails };

const LINK_GONE = 'This invite link has expired or was already used.';

const ACCESS = { full: 'Full access', view: 'View only' } as const;

/** Spec §3, the partner accepting an invite. */
export function Accept({
  auth,
  token,
  inviteDetails,
  acceptInvite,
  onSignedIn,
  onShowSignIn,
}: AcceptProps) {
  const [loaded, setLoaded] = useState<Loaded>(
    token === '' ? { kind: 'error', message: LINK_GONE } : { kind: 'loading' },
  );
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (token === '') return;
    let cancelled = false;
    inviteDetails({ token }).then(
      (invite) => !cancelled && setLoaded({ kind: 'ready', invite }),
      (err: unknown) => !cancelled && setLoaded({ kind: 'error', message: apiErrorMessage(err) }),
    );
    return () => {
      cancelled = true;
    };
  }, [inviteDetails, token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = acceptInviteInput.safeParse({
      token,
      name: String(form.get('name')),
      email: String(form.get('email')),
      password,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await acceptInvite(parsed.data);
    } catch (err) {
      setError(apiErrorMessage(err));
      setBusy(false);
      return;
    }
    try {
      await auth.signIn(parsed.data.email, password, false);
      onSignedIn();
    } catch {
      // They have a login now; they only need to sign in themselves.
      onShowSignIn();
    }
  }

  if (loaded.kind === 'loading') {
    return (
      <AuthLayout>
        <p role="status">Loading…</p>
      </AuthLayout>
    );
  }

  if (loaded.kind === 'error') {
    const gone = loaded.message !== GENERIC_ERROR;
    return (
      <AuthLayout>
        <div className="form">
          <h1>This invite can&apos;t be used</h1>
          <p role="alert" className="error">
            {loaded.message}
          </p>
          {gone && <p>Ask the person who invited you to send a new invite.</p>}
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

  const { invite } = loaded;
  const strength = passwordStrength(password);
  return (
    <AuthLayout>
      <form onSubmit={(e) => void submit(e)} className="form" noValidate>
        <h1>{`${invite.inviterName} invited you to ${invite.householdName}`}</h1>
        {invite.note !== '' && <blockquote className="invite-note">{invite.note}</blockquote>}
        <p>
          Access: <strong>{ACCESS[invite.role]}</strong>
        </p>
        <label>
          First name
          <input name="name" autoComplete="given-name" defaultValue={invite.inviteeName} required />
        </label>
        <label>
          Email
          <input
            name="email"
            type="email"
            autoComplete="username"
            defaultValue={invite.email}
            required
          />
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
          Join household
        </button>
      </form>
    </AuthLayout>
  );
}
