import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { MeResult } from './Hello';
import { accountsStub } from './accountsStub';
import { cardsStub } from './cardsStub';
import { categoriesStub } from './categoriesStub';
import { MemberScreen } from './MemberScreen';
import { paychecksStub } from './paychecksStub';
import { recurringBillsStub } from './recurringBillsStub';
import { SetupPage } from './SetupPage';
import { welcomeStub } from './welcomeStub';

const HEADING = 'This login isn’t in a household';

function screenFor(me: MeResult, sessionEmail?: () => Promise<string | undefined>) {
  render(
    <MemberScreen
      client={{ me: { query: () => Promise.resolve(me) } }}
      route="bills"
      onNavigate={() => {}}
      {...(sessionEmail && { sessionEmail })}
    >
      <p>page body</p>
    </MemberScreen>,
  );
}

const text = async () => {
  const heading = await screen.findByRole('heading', { level: 1, name: HEADING });
  return heading.parentElement?.textContent;
};
const REST =
  'but it has no household to show. Sign out, then sign in with the login you used to sign up, or accept an invite.';

describe('P2-15 the message', () => {
  const known: MeResult = {
    user: { name: 'Sam', email: 'known@example.test' },
    household: null,
  };

  it('names the email from me, and does not show the page', async () => {
    const sessionEmail = vi.fn(() => Promise.resolve('session@example.test'));
    screenFor(known, sessionEmail);

    expect(await text()).toContain(`You’re signed in as known@example.test, ${REST}`);
    expect(screen.queryByText('page body')).not.toBeInTheDocument();
    expect(sessionEmail).not.toHaveBeenCalled();
  });

  it('takes the email from the session when me has none', async () => {
    screenFor({ user: null, household: null }, () => Promise.resolve('session@example.test'));

    expect(await screen.findByText(/session@example\.test/)).toBeInTheDocument();
    expect(await text()).toContain(`You’re signed in as session@example.test, ${REST}`);
  });

  it.each([
    ['there is no way to ask', undefined],
    ['the session has none', () => Promise.resolve(undefined)],
    ['asking fails', () => Promise.reject(new Error('boom'))],
  ])('leaves the email out when %s', async (_name, sessionEmail) => {
    screenFor({ user: null, household: null }, sessionEmail);

    expect(await text()).toContain(`You’re signed in, ${REST}`);
    expect(await text()).not.toContain(' as ');
  });

  it('Setup shows the same message, with Sign out', async () => {
    const onSignOut = vi.fn();
    render(
      <SetupPage
        client={{
          ...accountsStub,
          ...cardsStub,
          ...categoriesStub,
          ...recurringBillsStub,
          ...paychecksStub,
          ...welcomeStub,
          me: { query: () => Promise.resolve({ user: null, household: null }) },
          setupProgress: { query: () => Promise.resolve([]) },
          saveSetupStep: { mutate: vi.fn() },
        }}
        onExit={() => {}}
        onSignOut={onSignOut}
        sessionEmail={() => Promise.resolve('session@example.test')}
      />,
    );

    expect(await screen.findByText(/signed in as session@example\.test/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(onSignOut).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
