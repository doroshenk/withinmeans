import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';
import type { AuthClient } from './auth/types';
import { accountsStub } from './pages/accountsStub';
import { categoriesStub } from './pages/categoriesStub';
import type { MeResult } from './pages/Hello';
import { otherIncomeStub } from './pages/otherIncomeStub';
import { paychecksStub } from './pages/paychecksStub';
import { recurringBillsStub } from './pages/recurringBillsStub';
import { welcomeStub } from './pages/welcomeStub';

function start(me: () => Promise<MeResult>) {
  const auth: AuthClient = {
    signIn: vi.fn(() => Promise.resolve()),
    signOut: vi.fn(),
    forgotPassword: vi.fn(() => Promise.resolve()),
    resetPassword: vi.fn(() => Promise.resolve()),
    getAccessToken: vi.fn(() => Promise.resolve('token')),
  };
  const unused = () => Promise.reject(new Error('not used here'));
  const client = {
    me: { query: me },
    exportData: { query: unused },
    signUp: { mutate: unused },
    invitePartner: { mutate: unused },
    resendInvite: { mutate: unused },
    inviteDetails: { query: unused },
    acceptInvite: { mutate: unused },
    ...accountsStub,
    ...categoriesStub,
    ...recurringBillsStub,
    ...otherIncomeStub,
    ...paychecksStub,
    ...welcomeStub,
    setupProgress: { query: () => Promise.resolve([]) },
    saveSetupStep: { mutate: () => Promise.resolve({}) },
  };
  render(<App auth={auth} createClient={() => client} />);
  return userEvent.setup();
}

const member: MeResult = {
  user: { name: 'Sam', email: 'sam@example.com' },
  household: { name: 'The Examples', role: 'owner' },
};

const nav = () => screen.getByRole('navigation', { name: 'Main' });

describe('P2-04 getting to the Paychecks & income page', () => {
  it('opens from the sidebar, and Recurring bills and Dashboard still work', async () => {
    const user = start(() => Promise.resolve(member));
    await screen.findByRole('heading', { name: 'Hello Sam' });

    await user.click(within(nav()).getByRole('link', { name: 'Paychecks & income' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'November 2026' }),
    ).toBeInTheDocument();
    expect(within(nav()).getByRole('link', { name: 'Paychecks & income' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await user.click(within(nav()).getByRole('link', { name: 'Recurring bills' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Recurring bills' }),
    ).toBeInTheDocument();

    await user.click(within(nav()).getByRole('link', { name: 'Dashboard' }));
    expect(await screen.findByRole('heading', { name: 'Hello Sam' })).toBeInTheDocument();
  });

  it('says when it cannot tell who is signed in', async () => {
    let calls = 0;
    const user = start(() =>
      calls++ === 0 ? Promise.resolve(member) : Promise.reject(new Error('boom')),
    );
    await screen.findByRole('heading', { name: 'Hello Sam' });

    await user.click(within(nav()).getByRole('link', { name: 'Paychecks & income' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
  });
});
