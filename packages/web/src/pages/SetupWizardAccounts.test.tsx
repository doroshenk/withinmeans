import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RoleProvider } from '../permissions';
import { accountsStub } from './accountsStub';
import { categoriesStub } from './categoriesStub';
import { SetupWizard, type SetupClient } from './SetupWizard';
import { welcomeStub } from './welcomeStub';

function fakeClient(accountCount: number) {
  const save = vi.fn((input: { step: number; status: 'done' | 'skipped' }) =>
    Promise.resolve({ ...input }),
  );
  const client: SetupClient = {
    setupProgress: { query: () => Promise.resolve([{ step: 1, status: 'done' as const }]) },
    saveSetupStep: { mutate: save },
    ...categoriesStub,
    ...welcomeStub,
    ...accountsStub,
    setupAccounts: {
      query: () =>
        Promise.resolve({
          accounts: Array.from({ length: accountCount }, (_, i) => ({
            id: `a${i}`,
            name: `Account ${i}`,
            type: 'checking' as const,
            balanceCents: 1_000,
            isPrimaryChecking: i === 0,
          })),
          cushionCents: 0,
        }),
    },
  };
  return { client, save };
}

function open(client: SetupClient) {
  render(
    <RoleProvider role="owner">
      <SetupWizard client={client} householdName="The Examples" onExit={() => {}} />
    </RoleProvider>,
  );
  return userEvent.setup();
}

describe('P1-10 setup step 2 in the wizard', () => {
  it('shows the bank accounts instead of "Coming soon"', async () => {
    const { client } = fakeClient(1);
    open(client);

    expect(await screen.findByText('Step 2 of 9')).toBeInTheDocument();
    expect(await screen.findByRole('textbox', { name: 'Checking cushion' })).toBeInTheDocument();
    expect(screen.queryByText('Coming soon')).not.toBeInTheDocument();
  });

  it('P1-10: at least one account is required: Save & continue is refused with a message', async () => {
    const { client, save } = fakeClient(0);
    const user = open(client);
    await screen.findByRole('textbox', { name: 'Checking cushion' });

    await user.click(screen.getByRole('button', { name: 'Save & continue' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Add at least one account.');
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByText('Step 2 of 9')).toBeInTheDocument();
  });

  it('with an account, Save & continue saves step 2 and moves on', async () => {
    const { client, save } = fakeClient(1);
    const user = open(client);
    await screen.findByRole('textbox', { name: 'Checking cushion' });

    await user.click(screen.getByRole('button', { name: 'Save & continue' }));

    expect(await screen.findByText('Step 3 of 9')).toBeInTheDocument();
    expect(save).toHaveBeenCalledWith({ step: 2, status: 'done' });
  });
});
