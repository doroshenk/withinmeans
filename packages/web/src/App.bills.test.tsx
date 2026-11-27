import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';
import type { AuthClient } from './auth/types';
import { accountsStub } from './pages/accountsStub';
import { billsPageStub } from './pages/billsPageStub';
import { categoriesStub } from './pages/categoriesStub';
import type { MeResult } from './pages/Hello';
import { otherIncomeStub } from './pages/otherIncomeStub';
import { paychecksPageStub } from './pages/paychecksPageStub';
import { paychecksStub } from './pages/paychecksStub';
import { recurringBillsStub } from './pages/recurringBillsStub';
import { welcomeStub } from './pages/welcomeStub';

const member: MeResult = {
  user: { name: 'Sam', email: 'sam@example.com' },
  household: { name: 'The Examples', role: 'owner' },
};

function start() {
  const auth: AuthClient = {
    signIn: vi.fn(() => Promise.resolve()),
    signOut: vi.fn(),
    forgotPassword: vi.fn(() => Promise.resolve()),
    resetPassword: vi.fn(() => Promise.resolve()),
    getAccessToken: vi.fn(() => Promise.resolve('token')),
  };
  const unused = () => Promise.reject(new Error('not used here'));
  const client = {
    me: { query: () => Promise.resolve(member) },
    exportData: { query: unused },
    signUp: { mutate: unused },
    invitePartner: { mutate: unused },
    resendInvite: { mutate: unused },
    inviteDetails: { query: unused },
    acceptInvite: { mutate: unused },
    ...accountsStub,
    ...billsPageStub,
    ...categoriesStub,
    ...recurringBillsStub,
    ...otherIncomeStub,
    ...paychecksPageStub,
    ...paychecksStub,
    ...welcomeStub,
    setupProgress: { query: () => Promise.resolve([]) },
    saveSetupStep: { mutate: () => Promise.resolve({}) },
  };
  render(<App auth={auth} createClient={() => client} />);
  return userEvent.setup();
}

const nav = () => screen.getByRole('navigation', { name: 'Main' });

describe('P2-06 getting to the Bills & cash flow page', () => {
  it('opens from the sidebar, and links on to Recurring bills', async () => {
    const user = start();
    await screen.findByRole('heading', { name: 'Hello Sam' });

    await user.click(within(nav()).getByRole('link', { name: 'Bills & cash flow' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'November 2026' }),
    ).toBeInTheDocument();
    expect(within(nav()).getByRole('link', { name: 'Bills & cash flow' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await user.click(await screen.findByRole('button', { name: 'Add recurring bills' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Recurring bills' }),
    ).toBeInTheDocument();
  });
});
