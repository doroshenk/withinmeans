import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RoleProvider, type Role } from '../permissions';
import { accountsStub } from './accountsStub';
import { categoriesStub } from './categoriesStub';
import { paychecksStub } from './paychecksStub';
import { recurringBillsStub } from './recurringBillsStub';
import { welcomeStub } from './welcomeStub';
import { SetupWizard, type SetupClient } from './SetupWizard';

type Row = { step: number; status: 'done' | 'skipped' };

/** A fake API that remembers what was saved, like the real one, so "leave and return" is testable. */
function fakeClient(initial: Row[] = []) {
  const rows = new Map(initial.map((r) => [r.step, r.status]));
  const save = vi.fn((input: Row) => {
    rows.set(input.step, input.status);
    return Promise.resolve({ ...input });
  });
  const client: SetupClient = {
    setupProgress: {
      query: () =>
        Promise.resolve(
          [...rows].map(([step, status]) => ({ step, status })).sort((a, b) => a.step - b.step),
        ),
    },
    saveSetupStep: { mutate: save },
    ...accountsStub,
    ...categoriesStub,
    ...recurringBillsStub,
    ...paychecksStub,
    ...welcomeStub,
  };
  return { client, save };
}

function wizard(client: SetupClient, role: Role = 'owner', onExit: () => void = () => {}) {
  return (
    <RoleProvider role={role}>
      <SetupWizard client={client} householdName="The Examples" onExit={onExit} />
    </RoleProvider>
  );
}

function open(client: SetupClient, role: Role = 'owner') {
  const view = render(wizard(client, role));
  return { user: userEvent.setup(), view };
}

const stepper = () => screen.getByRole('navigation', { name: 'Setup steps' });
const stepButton = (name: RegExp) => within(stepper()).getByRole('button', { name });

describe('P1-08 setup wizard', () => {
  it('starts at step 1 when nothing is saved, and the stepper lists all 9 steps', async () => {
    open(fakeClient().client);

    expect(await screen.findByText('Step 1 of 9')).toBeInTheDocument();
    expect(within(stepper()).getAllByRole('button')).toHaveLength(9);
    expect(screen.getByText('0 of 9 steps done')).toBeInTheDocument();
  });

  it('P1-08: leaving and returning resumes at the last unfinished step', async () => {
    const { client } = fakeClient();
    const { user, view } = open(client);
    await screen.findByText('Step 1 of 9');
    await user.click(screen.getByRole('button', { name: 'Save & continue' }));
    await screen.findByText('Step 2 of 9');
    await user.click(screen.getByRole('button', { name: 'Save & continue' }));
    await screen.findByText('Step 3 of 9');

    // Leave (unmount) and come back with the same saved data.
    view.unmount();
    render(wizard(client));

    expect(await screen.findByText('Step 3 of 9')).toBeInTheDocument();
  });

  it('resumes at the first unfinished step even when a later step is already done', async () => {
    open(
      fakeClient([
        { step: 1, status: 'done' },
        { step: 2, status: 'done' },
        { step: 5, status: 'done' },
      ]).client,
    );

    expect(await screen.findByText('Step 3 of 9')).toBeInTheDocument();
  });

  it('save & continue saves the step as done and moves to the next one', async () => {
    const { client, save } = fakeClient();
    const { user } = open(client);
    await screen.findByText('Step 1 of 9');

    await user.click(screen.getByRole('button', { name: 'Save & continue' }));

    expect(save).toHaveBeenCalledWith({ step: 1, status: 'done' });
    expect(await screen.findByText('Step 2 of 9')).toBeInTheDocument();
    expect(stepButton(/^Welcome/)).toHaveTextContent('Done');
  });

  it('shows an error and stays put when saving fails', async () => {
    const { client } = fakeClient();
    client.saveSetupStep.mutate = vi.fn(() => Promise.reject(new Error('boom')));
    const { user } = open(client);
    await screen.findByText('Step 1 of 9');

    await user.click(screen.getByRole('button', { name: 'Save & continue' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
    expect(screen.getByText('Step 1 of 9')).toBeInTheDocument();
  });

  it('jumps to any step from the stepper', async () => {
    const { user } = open(fakeClient().client);
    await screen.findByText('Step 1 of 9');

    await user.click(stepButton(/^Investments/));

    expect(screen.getByText('Step 7 of 9')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Investments' })).toBeInTheDocument();
  });

  it('Back goes to the previous step and is missing on step 1', async () => {
    const { user } = open(fakeClient().client);
    await screen.findByText('Step 1 of 9');
    expect(screen.queryByRole('button', { name: /Back/ })).not.toBeInTheDocument();

    await user.click(stepButton(/^Bank accounts/));
    await user.click(screen.getByRole('button', { name: /Back/ }));

    expect(screen.getByText('Step 1 of 9')).toBeInTheDocument();
  });

  it('unbuilt steps say "Coming soon"', async () => {
    const { user } = open(fakeClient().client);
    await screen.findByText('Step 1 of 9');

    await user.click(stepButton(/^Credit cards/));

    expect(screen.getByText('Coming soon')).toBeInTheDocument();
  });

  it('P1-11: step 4 shows the bill categories instead of "Coming soon"', async () => {
    const { user } = open(fakeClient().client);
    await screen.findByText('Step 1 of 9');

    await user.click(stepButton(/^Bill categories/));

    expect(await screen.findByRole('textbox', { name: 'Name of Housing' })).toBeInTheDocument();
    expect(screen.queryByText('Coming soon')).not.toBeInTheDocument();
  });

  it('only optional steps can be skipped', async () => {
    const { user } = open(fakeClient().client);
    await screen.findByText('Step 1 of 9');
    expect(screen.queryByRole('button', { name: 'Skip for now' })).not.toBeInTheDocument();

    await user.click(stepButton(/^Paychecks/));

    expect(screen.getByText('Optional')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Skip for now' })).toBeInTheDocument();
  });

  it('P1-08: skipped optional steps show as skipped in the stepper and in Review', async () => {
    const { client, save } = fakeClient([
      { step: 1, status: 'done' },
      { step: 2, status: 'done' },
    ]);
    const { user } = open(client);
    await screen.findByText('Step 3 of 9');

    await user.click(screen.getByRole('button', { name: 'Skip for now' }));

    expect(save).toHaveBeenCalledWith({ step: 3, status: 'skipped' });
    expect(await screen.findByText('Step 4 of 9')).toBeInTheDocument();
    expect(stepButton(/^Paychecks/)).toHaveTextContent('Skipped');

    await user.click(stepButton(/^Review & finish/));
    const review = screen.getByRole('list', { name: 'Review' });
    const paychecks = within(review).getByText('Paychecks').closest('li') as HTMLElement;
    expect(paychecks).toHaveTextContent('Skipped');
    expect(within(paychecks).getByRole('button', { name: 'Add now' })).toBeInTheDocument();
    const welcome = within(review).getByText('Welcome').closest('li') as HTMLElement;
    expect(welcome).toHaveTextContent('Done');
    expect(within(welcome).getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    const categories = within(review).getByText('Bill categories').closest('li') as HTMLElement;
    expect(within(categories).getByRole('button', { name: 'Finish this' })).toBeInTheDocument();
  });

  it('Review actions jump to that step', async () => {
    const { user } = open(fakeClient([{ step: 1, status: 'done' }]).client);
    await screen.findByText('Step 2 of 9');
    await user.click(stepButton(/^Review & finish/));

    await user.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByText('Step 1 of 9')).toBeInTheDocument();
  });

  it('P1-08: step 9 has Finish setup, which saves it as done and leaves the wizard', async () => {
    const onExit = vi.fn();
    const { client, save } = fakeClient([{ step: 1, status: 'done' }]);
    render(wizard(client, 'owner', onExit));
    await screen.findByText('Step 2 of 9');
    await userEvent.click(stepButton(/^Review & finish/));

    await userEvent.click(screen.getByRole('button', { name: 'Finish setup' }));

    expect(save).toHaveBeenCalledWith({ step: 9, status: 'done' });
    expect(onExit).toHaveBeenCalledOnce();
  });

  it('a view-only member sees no Finish setup button', async () => {
    const { user } = open(fakeClient().client, 'view');
    await screen.findByText('Step 1 of 9');
    await user.click(stepButton(/^Review & finish/));

    expect(screen.queryByRole('button', { name: 'Finish setup' })).not.toBeInTheDocument();
  });

  it('a view-only member can look around but not save or skip', async () => {
    const { user } = open(fakeClient().client, 'view');
    await screen.findByText('Step 1 of 9');
    await user.click(stepButton(/^Paychecks/));

    expect(screen.queryByRole('button', { name: 'Skip for now' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save & continue' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next →' }));
    expect(screen.getByText('Step 4 of 9')).toBeInTheDocument();
  });

  it('shows "Loading…" first and a generic error if progress cannot be loaded', async () => {
    const client: SetupClient = {
      ...accountsStub,
      ...categoriesStub,
      ...recurringBillsStub,
      ...paychecksStub,
      ...welcomeStub,
      setupProgress: { query: () => Promise.reject(new Error('boom')) },
      saveSetupStep: { mutate: vi.fn() },
    };
    open(client);

    expect(screen.getByRole('status').textContent).toBe('Loading…');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
  });

  it('reports the progress count and exits when asked', async () => {
    const onExit = vi.fn();
    render(wizard(fakeClient([{ step: 1, status: 'done' }]).client, 'owner', onExit));
    expect(await screen.findByText('1 of 9 steps done')).toBeInTheDocument();
    expect(screen.getByText('Set up The Examples')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Leave setup' }));

    expect(onExit).toHaveBeenCalledOnce();
  });
});

describe('P1-09 setup step 1: first month', () => {
  function withFirstMonth(initial: Row[] = []) {
    const { client, save } = fakeClient(initial);
    const start = vi.fn((input: { choice: 'this' | 'next' }) =>
      Promise.resolve({ firstMonth: input.choice === 'this' ? '2026-11' : '2026-12' }),
    );
    client.startFirstMonth = { mutate: start };
    return { client, save, start };
  }

  it('step 1 shows the first-month choice instead of "Coming soon"', async () => {
    const { client } = withFirstMonth();
    open(client);

    expect(await screen.findByRole('radio', { name: /This month/ })).toBeChecked();
    expect(screen.queryByText('Coming soon')).not.toBeInTheDocument();
  });

  it('"This month" is the default: Save & continue opens it, then saves the step', async () => {
    const { client, save, start } = withFirstMonth();
    const { user } = open(client);
    await screen.findByRole('radio', { name: /This month/ });

    await user.click(screen.getByRole('button', { name: 'Save & continue' }));

    expect(start).toHaveBeenCalledWith({ choice: 'this' });
    expect(save).toHaveBeenCalledWith({ step: 1, status: 'done' });
    expect(start.mock.invocationCallOrder[0]).toBeLessThan(save.mock.invocationCallOrder[0] ?? 0);
    expect(await screen.findByText('Step 2 of 9')).toBeInTheDocument();
  });

  it('choosing Next month opens next month', async () => {
    const { client, start } = withFirstMonth();
    const { user } = open(client);

    await user.click(await screen.findByRole('radio', { name: /Next month/ }));
    await user.click(screen.getByRole('button', { name: 'Save & continue' }));

    expect(start).toHaveBeenCalledWith({ choice: 'next' });
    expect(await screen.findByText('Step 2 of 9')).toBeInTheDocument();
  });

  it('if opening the month fails, shows an error, saves nothing and stays on step 1', async () => {
    const { client, save, start } = withFirstMonth();
    start.mockRejectedValueOnce(new Error('boom'));
    const { user } = open(client);
    await screen.findByRole('radio', { name: /This month/ });

    await user.click(screen.getByRole('button', { name: 'Save & continue' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByText('Step 1 of 9')).toBeInTheDocument();
  });

  it('once step 1 is done, saving it again does not open a month again', async () => {
    const { client, save, start } = withFirstMonth([{ step: 1, status: 'done' }]);
    const { user } = open(client);
    await screen.findByText('Step 2 of 9');

    await user.click(stepButton(/^Welcome/));
    expect(await screen.findByText(/Your first month is/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save & continue' }));

    expect(save).toHaveBeenCalledWith({ step: 1, status: 'done' });
    expect(start).not.toHaveBeenCalled();
  });

  it('if the month is already open but step 1 is not saved, Save & continue only saves the step', async () => {
    const { client, save, start } = withFirstMonth();
    client.firstMonthOptions = {
      query: () =>
        Promise.resolve({
          thisMonth: '2026-11',
          nextMonth: '2026-12',
          firstMonth: '2026-12',
          opened: true,
        }),
    };
    const { user } = open(client);
    await screen.findByText(/Your first month is December 2026/);

    await user.click(screen.getByRole('button', { name: 'Save & continue' }));

    expect(start).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledWith({ step: 1, status: 'done' });
  });

  it('a view-only member does not open a month', async () => {
    const { client, start } = withFirstMonth();
    const { user } = open(client, 'view');

    expect(await screen.findByRole('radio', { name: /This month/ })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Next →' }));

    expect(start).not.toHaveBeenCalled();
  });
});

describe('P1-13 setup step 9: review and finish', () => {
  async function openReview(initial: Row[], role: Role = 'owner') {
    const { client, save } = fakeClient(initial);
    const { user } = open(client, role);
    await screen.findByText(/^Step \d of 9$/);
    await user.click(stepButton(/^Review & finish/));
    return { user, save };
  }

  const reviewRow = (title: string) =>
    within(screen.getByRole('list', { name: 'Review' }))
      .getByText(title)
      .closest('li') as HTMLElement;

  const saved: Row[] = [
    { step: 1, status: 'done' },
    { step: 3, status: 'skipped' },
    { step: 6, status: 'skipped' },
    { step: 7, status: 'done' },
  ];

  it('P1-13: Review reflects saved, skipped and coming-soon steps correctly', async () => {
    await openReview(saved);

    const expected = [
      ['Welcome', 'Done', 'Edit'],
      ['Bank accounts', 'Not started', 'Finish this'],
      ['Paychecks', 'Skipped', 'Add now'],
      ['Bill categories', 'Not started', 'Finish this'],
      ['Recurring bills', 'Not started', 'Finish this'],
      ['Credit cards', 'Skipped · Coming soon', 'Add now'],
      ['Investments', 'Coming soon', 'Add now'],
      ['Where income goes', 'Coming soon', 'Finish this'],
    ] as const;
    for (const [title, status, action] of expected) {
      const row = reviewRow(title);
      expect(within(row).getByText(status)).toBeInTheDocument();
      expect(within(row).getByRole('button', { name: action })).toBeInTheDocument();
    }
  });

  it('a coming-soon step never shows as done in the stepper or the count', async () => {
    await openReview(saved);

    expect(stepButton(/^Investments/)).not.toHaveTextContent('Done');
    expect(stepButton(/^Investments/)).toHaveTextContent('Holdings and current prices');
    expect(screen.getByText('1 of 9 steps done')).toBeInTheDocument();
  });

  it('an optional coming-soon step can be skipped or passed, never saved as done', async () => {
    const { client, save } = fakeClient();
    const { user } = open(client);
    await screen.findByText('Step 1 of 9');
    await user.click(stepButton(/^Credit cards/));

    expect(screen.queryByRole('button', { name: 'Save & continue' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Skip for now' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next →' }));

    expect(screen.getByText('Step 7 of 9')).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it('the required coming-soon step 8 moves on to Review without saving', async () => {
    const { client, save } = fakeClient();
    const { user } = open(client);
    await screen.findByText('Step 1 of 9');
    await user.click(stepButton(/^Where income goes/));

    expect(screen.queryByRole('button', { name: 'Save & continue' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next →' }));

    expect(screen.getByRole('list', { name: 'Review' })).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it('a view-only member can open each step from Review, with no editing words', async () => {
    const { user } = await openReview(saved, 'view');

    expect(screen.queryAllByRole('button', { name: /Edit|Add now|Finish this/ })).toHaveLength(0);
    await user.click(within(reviewRow('Welcome')).getByRole('button', { name: 'View' }));
    expect(screen.getByText('Step 1 of 9')).toBeInTheDocument();
  });

  it('reopening a finished setup does not land on a coming-soon step', async () => {
    open(fakeClient([1, 2, 3, 4, 5, 9].map((step) => ({ step, status: 'done' }) as Row)).client);

    expect(await screen.findByText('Step 9 of 9')).toBeInTheDocument();
  });

  it('P2-09: reopening a finished setup lands on step 3 if it was never answered', async () => {
    open(fakeClient([1, 2, 4, 5, 9].map((step) => ({ step, status: 'done' }) as Row)).client);

    expect(await screen.findByText('Step 3 of 9')).toBeInTheDocument();
  });
});
