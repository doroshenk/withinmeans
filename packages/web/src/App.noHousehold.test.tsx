import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import type { AuthClient } from './auth/types';
import { accountsStub } from './pages/accountsStub';
import { billsPageStub } from './pages/billsPageStub';
import { cardsStub } from './pages/cardsStub';
import { categoriesStub } from './pages/categoriesStub';
import type { MeResult } from './pages/Hello';
import { otherIncomeStub } from './pages/otherIncomeStub';
import { paychecksPageStub } from './pages/paychecksPageStub';
import { paychecksStub } from './pages/paychecksStub';
import { recurringBillsStub } from './pages/recurringBillsStub';
import { welcomeStub } from './pages/welcomeStub';

const HEADING = 'This login isn’t in a household';
const GENERIC = 'Something went wrong. Please try again.';

/** A login the app never signed up: the API knows neither a user nor a household. */
const stranger: MeResult = { user: null, household: null };

function start({ me = () => Promise.resolve(stranger) } = {}) {
  const auth: AuthClient = {
    signIn: vi.fn(() => Promise.resolve()),
    signOut: vi.fn(),
    forgotPassword: vi.fn(() => Promise.resolve()),
    resetPassword: vi.fn(() => Promise.resolve()),
    getAccessToken: vi.fn(() => Promise.resolve('token')),
    getEmail: vi.fn(() => Promise.resolve('sam@example.test')),
  };
  const unused = () => Promise.reject(new Error('not used here'));
  const pageData = vi.fn(unused);
  const client = {
    ...accountsStub,
    ...billsPageStub,
    ...cardsStub,
    ...categoriesStub,
    ...recurringBillsStub,
    ...otherIncomeStub,
    ...paychecksPageStub,
    ...paychecksStub,
    ...welcomeStub,
    me: { query: me },
    billsPage: { query: pageData },
    exportData: { query: unused },
    signUp: { mutate: unused },
    invitePartner: { mutate: unused },
    resendInvite: { mutate: unused },
    inviteDetails: { query: unused },
    acceptInvite: { mutate: unused },
    setupProgress: { query: () => Promise.resolve([]) },
    saveSetupStep: { mutate: () => Promise.resolve({}) },
  };
  render(<App auth={auth} createClient={() => client} />);
  return { user: userEvent.setup(), auth, pageData };
}

const nav = () => screen.getByRole('navigation', { name: 'Main' });
const message = () => screen.findByRole('heading', { level: 1, name: HEADING });
const PAGES = ['Dashboard', 'Bills & cash flow', 'Recurring bills', 'Paychecks & income'];

afterEach(() => vi.unstubAllGlobals());

describe('P2-15 a login with no household', () => {
  it.each(PAGES)('%s shows the message, not the generic error', async (page) => {
    const { user, pageData } = start();
    await message();

    await user.click(within(nav()).getByRole('link', { name: page }));

    expect(await message()).toBeInTheDocument();
    expect(await screen.findByText(/signed in as sam@example\.test/)).toBeInTheDocument();
    expect(screen.queryByText(GENERIC)).not.toBeInTheDocument();
    expect(pageData).not.toHaveBeenCalled();
  });

  it('The Dashboard shows it in place of the greeting', async () => {
    start();
    await message();

    expect(screen.queryByRole('heading', { name: /^Hello/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Your dashboard is coming soon.')).not.toBeInTheDocument();
  });

  it.each(PAGES)(
    'Sign out on %s signs out and returns to the sign-in screen, with one button',
    async (page) => {
      const { user, auth } = start();
      await message();
      await user.click(within(nav()).getByRole('link', { name: page }));
      await message();

      await user.click(screen.getByRole('button', { name: 'Sign out' }));

      expect(auth.signOut).toHaveBeenCalledOnce();
      expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: HEADING })).not.toBeInTheDocument();
    },
  );

  it.each(PAGES)('%s has no write controls and no "+ Add"', async (page) => {
    const { user } = start();
    await message();

    await user.click(within(nav()).getByRole('link', { name: page }));
    await message();

    const buttons = screen.queryAllByRole('button').map((b) => b.textContent);
    expect(buttons).toEqual(['Sign out']);
  });

  it('has no Add tab on a phone', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));

    start();
    await message();

    expect(screen.getByRole('navigation', { name: 'Tabs' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument();
  });

  it.each(PAGES)('A failed me call still shows the generic error on %s', async (page) => {
    const { user } = start({ me: () => Promise.reject(new Error('boom')) });
    await screen.findByRole('alert');

    await user.click(within(nav()).getByRole('link', { name: page }));

    expect(await screen.findByRole('alert')).toHaveTextContent(GENERIC);
    expect(screen.queryByRole('heading', { name: HEADING })).not.toBeInTheDocument();
  });
});
