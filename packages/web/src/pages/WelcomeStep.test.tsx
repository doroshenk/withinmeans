import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RoleProvider, type Role } from '../permissions';
import { WelcomeStep, type WelcomeClient, type WelcomeStepProps } from './WelcomeStep';
import { welcomeStub } from './welcomeStub';

function show(overrides: Partial<WelcomeStepProps> = {}, role: Role = 'owner') {
  const onChoice = vi.fn();
  const props: WelcomeStepProps = {
    client: welcomeStub,
    done: false,
    choice: 'this',
    onChoice,
    ...overrides,
  };
  render(
    <RoleProvider role={role}>
      <WelcomeStep {...props} />
    </RoleProvider>,
  );
  return { onChoice, user: userEvent.setup() };
}

describe('P1-09 setup step 1: first month', () => {
  it('offers this month and next month, named, with what each means', async () => {
    show();

    expect(await screen.findByRole('radio', { name: /This month/ })).toBeChecked();
    expect(screen.getByText('November 2026')).toBeInTheDocument();
    expect(screen.getByText(/catch up from the 1st/i)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Next month/ })).not.toBeChecked();
    expect(screen.getByText('December 2026')).toBeInTheDocument();
    expect(screen.getByText(/start fresh/i)).toBeInTheDocument();
  });

  it('shows the selected choice from its props', async () => {
    show({ choice: 'next' });

    expect(await screen.findByRole('radio', { name: /Next month/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /This month/ })).not.toBeChecked();
  });

  it('picking Next month reports the choice and calls nothing yet', async () => {
    const client: WelcomeClient = {
      ...welcomeStub,
      startFirstMonth: { mutate: vi.fn(() => Promise.resolve({ firstMonth: '2026-12' })) },
    };
    const { onChoice, user } = show({ client });

    await user.click(await screen.findByRole('radio', { name: /Next month/ }));

    expect(onChoice).toHaveBeenCalledWith('next');
    expect(client.startFirstMonth.mutate).not.toHaveBeenCalled();
  });

  it('once saved, shows the chosen first month and no choice', async () => {
    const client: WelcomeClient = {
      ...welcomeStub,
      firstMonthOptions: {
        query: () =>
          Promise.resolve({
            thisMonth: '2026-11',
            nextMonth: '2026-12',
            firstMonth: '2026-12',
            opened: true,
          }),
      },
    };
    show({ client, done: true });

    expect(await screen.findByText(/Your first month is December 2026/)).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('if the month is already open (an earlier save failed), shows it instead of the choice', async () => {
    const client: WelcomeClient = {
      ...welcomeStub,
      firstMonthOptions: {
        query: () =>
          Promise.resolve({
            thisMonth: '2026-11',
            nextMonth: '2026-12',
            firstMonth: '2026-12',
            opened: true,
          }),
      },
    };
    show({ client, done: false });

    expect(await screen.findByText(/Your first month is December 2026/)).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('a view-only member sees the options but cannot change them', async () => {
    show({}, 'view');

    expect(await screen.findByRole('radio', { name: /This month/ })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /Next month/ })).toBeDisabled();
  });

  it('shows a generic error when the months cannot be loaded', async () => {
    const client: WelcomeClient = {
      ...welcomeStub,
      firstMonthOptions: { query: () => Promise.reject(new Error('boom')) },
    };
    show({ client });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
  });
});
