import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RoleProvider } from '../permissions';
import { accountsStub } from './accountsStub';
import { categoriesStub } from './categoriesStub';
import { recurringBillsStub } from './recurringBillsStub';
import { SetupWizard, type SetupClient } from './SetupWizard';
import { welcomeStub } from './welcomeStub';

function open() {
  const save = vi.fn((input: { step: number; status: 'done' | 'skipped' }) =>
    Promise.resolve({ ...input }),
  );
  const client: SetupClient = {
    setupProgress: {
      query: () => Promise.resolve([1, 2, 3, 4].map((step) => ({ step, status: 'done' as const }))),
    },
    saveSetupStep: { mutate: save },
    ...welcomeStub,
    ...accountsStub,
    ...categoriesStub,
    ...recurringBillsStub,
  };
  render(
    <RoleProvider role="owner">
      <SetupWizard client={client} householdName="The Examples" onExit={() => {}} />
    </RoleProvider>,
  );
  return { user: userEvent.setup(), save };
}

describe('P1-12 setup step 5 in the wizard', () => {
  it('shows the recurring bills instead of "Coming soon"', async () => {
    open();

    expect(await screen.findByText('Step 5 of 9')).toBeInTheDocument();
    expect(await screen.findByRole('textbox', { name: 'Bill name' })).toBeInTheDocument();
    expect(screen.queryByText('Coming soon')).not.toBeInTheDocument();
  });

  it('Save & continue saves step 5 and moves on to step 6', async () => {
    const { user, save } = open();
    await screen.findByRole('textbox', { name: 'Bill name' });

    await user.click(screen.getByRole('button', { name: 'Save & continue' }));

    expect(await screen.findByText('Step 6 of 9')).toBeInTheDocument();
    expect(save).toHaveBeenCalledWith({ step: 5, status: 'done' });
  });
});
