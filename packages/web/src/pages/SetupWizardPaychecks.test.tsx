import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RoleProvider } from '../permissions';
import { accountsStub } from './accountsStub';
import { cardsStub } from './cardsStub';
import { categoriesStub } from './categoriesStub';
import { paychecksStub } from './paychecksStub';
import { recurringBillsStub } from './recurringBillsStub';
import { SetupWizard, type SetupClient } from './SetupWizard';
import { welcomeStub } from './welcomeStub';

function open(paycheckCalls: Partial<SetupClient> = {}) {
  const save = vi.fn((input: { step: number; status: 'done' | 'skipped' }) =>
    Promise.resolve({ ...input }),
  );
  const client: SetupClient = {
    setupProgress: {
      query: () => Promise.resolve([1, 2].map((step) => ({ step, status: 'done' as const }))),
    },
    saveSetupStep: { mutate: save },
    ...welcomeStub,
    ...accountsStub,
    ...cardsStub,
    ...categoriesStub,
    ...recurringBillsStub,
    ...paychecksStub,
    ...paycheckCalls,
  };
  render(
    <RoleProvider role="owner">
      <SetupWizard client={client} householdName="The Examples" onExit={() => {}} />
    </RoleProvider>,
  );
  return { user: userEvent.setup(), save };
}

const withOnePaycheck: Partial<SetupClient> = {
  setupPaychecks: {
    query: () =>
      Promise.resolve({
        today: '2026-11-18',
        schedules: [
          {
            id: 'p1',
            name: 'Main job',
            frequency: 'biweekly',
            anchorDate: '2026-11-06',
            semimonthlyDays: null,
            usualCents: 322_500,
            endedOn: null,
          },
        ],
      }),
  },
};

describe('P2-09 setup step 3 in the wizard', () => {
  it('shows the paychecks instead of "Coming soon"', async () => {
    open();

    expect(await screen.findByText('Step 3 of 9')).toBeInTheDocument();
    expect(await screen.findByRole('textbox', { name: 'Paycheck name' })).toBeInTheDocument();
    expect(screen.queryByText('Coming soon')).not.toBeInTheDocument();
  });

  it('Save & continue needs a paycheck', async () => {
    const { user, save } = open();
    await screen.findByText('Step 3 of 9');

    await user.click(screen.getByRole('button', { name: 'Save & continue' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Add a paycheck, or skip this step.',
    );
    expect(save).not.toHaveBeenCalled();
  });

  it('Save & continue saves step 3 and moves on once there is one', async () => {
    const { user, save } = open(withOnePaycheck);
    await screen.findByText('Step 3 of 9');

    await user.click(screen.getByRole('button', { name: 'Save & continue' }));

    expect(await screen.findByText('Step 4 of 9')).toBeInTheDocument();
    expect(save).toHaveBeenCalledWith({ step: 3, status: 'done' });
  });
});
