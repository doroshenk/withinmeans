import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RoleProvider, type Role } from '../permissions';
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
    categories: {
      query: () => Promise.resolve([{ id: 'c1', name: 'Housing', colorIndex: 0, billCount: 0 }]),
    },
    seedDefaultCategories: { mutate: () => Promise.resolve({}) },
    createCategory: { mutate: () => Promise.resolve({ id: 'c2' }) },
    renameCategory: { mutate: () => Promise.resolve({}) },
    recolorCategory: { mutate: () => Promise.resolve({}) },
    deleteCategory: {
      mutate: () => Promise.resolve({ movedCount: 0, movedToName: '', message: null }),
    },
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
    expect(screen.getByText('Coming soon')).toBeInTheDocument();

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
