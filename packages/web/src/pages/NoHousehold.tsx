import { useEffect, useState } from 'react';

export interface NoHouseholdProps {
  /** The email `me` knows; a login the app never signed up has none there. */
  email?: string | undefined;
  /** The email of the signed-in session, asked for when `me` has none. */
  sessionEmail?: (() => Promise<string | undefined>) | undefined;
  onSignOut?: (() => void) | undefined;
}

/** A signed-in login that is in no household. Trying again cannot help, so this says what can. */
export function NoHousehold({ email, sessionEmail, onSignOut }: NoHouseholdProps) {
  const [fromSession, setFromSession] = useState<string>();

  useEffect(() => {
    if (email !== undefined) return;
    let cancelled = false;
    sessionEmail?.().then(
      (found) => !cancelled && setFromSession(found),
      // The message reads without an email.
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [email, sessionEmail]);

  const who = email ?? fromSession;
  return (
    <section className="no-household">
      <h1>This login isn’t in a household</h1>
      <p>
        {`You’re signed in${who === undefined ? '' : ` as ${who}`}, but it has no household to show. Sign out, then sign in with the login you used to sign up, or accept an invite.`}
      </p>
      {onSignOut && (
        <button type="button" className="button" onClick={onSignOut}>
          Sign out
        </button>
      )}
    </section>
  );
}
