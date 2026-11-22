import type { ReactNode } from 'react';

/** The split screen from design/SignIn.png: teal pitch on the left, the form on the right. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth">
      <aside className="auth-pitch">
        <p className="brand">Within Means</p>
        <div className="auth-pitch-copy">
          <h2>Live within your means — together or on your own.</h2>
          <ul>
            <li>Bills, paychecks and investments in one place</li>
            <li>Share a household with a partner — each with your own login</li>
            <li>Your data stays private to your household</li>
          </ul>
        </div>
      </aside>
      <section className="auth-form">{children}</section>
    </div>
  );
}
