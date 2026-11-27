import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';
import type { AuthClient } from './auth/types';
import { accountsStub } from './pages/accountsStub';
import { billsPageStub } from './pages/billsPageStub';
import type { BillsPageClient } from './pages/bills/types';
import { cardsStub } from './pages/cardsStub';
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

/** A Bills API that answers with whichever month is asked for. */
const billsPage: BillsPageClient['billsPage'] = {
  query: ({ ym = '2026-11' }) =>
    Promise.resolve({
      today: '2026-11-18',
      ym,
      status: 'open',
      canOpen: false,
      bills: [],
      categories: [{ id: 'c', name: 'Home', colorIndex: 2 }],
      paychecks: [],
      otherIncome: [],
      cards: [],
    }),
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
    ...cardsStub,
    ...categoriesStub,
    ...recurringBillsStub,
    ...otherIncomeStub,
    ...paychecksPageStub,
    ...paychecksStub,
    ...welcomeStub,
    billsPage,
    setupProgress: { query: () => Promise.resolve([]) },
    saveSetupStep: { mutate: () => Promise.resolve({}) },
  };
  render(<App auth={auth} createClient={() => client} />);
  return userEvent.setup();
}

const nav = () => screen.getByRole('navigation', { name: 'Main' });
const month = (name: string) => screen.findByRole('heading', { level: 1, name });

describe('P2-10 Quick Add in the app', () => {
  it('opens over the dashboard, and View shows the month the entry landed in', async () => {
    const user = start();
    await screen.findByRole('heading', { name: 'Hello Sam' });

    await user.click(await screen.findByRole('button', { name: '+ Add' }));
    const form = await screen.findByRole('form', { name: 'Add one-time bill' });
    await user.type(within(form).getByLabelText('Bill name'), 'Tires');
    await user.type(within(form).getByLabelText('Amount'), '60');
    await user.clear(within(form).getByLabelText('Due date'));
    await user.type(within(form).getByLabelText('Due date'), '2027-01-05');
    await user.selectOptions(within(form).getByLabelText('Category'), 'c');
    await user.click(within(form).getByRole('button', { name: 'Add bill' }));
    await user.click(await screen.findByRole('button', { name: 'View Tires' }));

    expect(await month('January 2027')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // The sidebar goes back to this month.
    await user.click(within(nav()).getByRole('link', { name: 'Bills & cash flow' }));
    expect(await month('November 2026')).toBeInTheDocument();
  });

  it('goes to Recurring bills from the bill form', async () => {
    const user = start();
    await screen.findByRole('heading', { name: 'Hello Sam' });
    await user.click(await screen.findByRole('button', { name: '+ Add' }));

    await user.click(await screen.findByRole('link', { name: 'Add it as a recurring bill' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Recurring bills' }),
    ).toBeInTheDocument();
  });
});
