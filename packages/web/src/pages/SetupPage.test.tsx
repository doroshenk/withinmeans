import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MeResult } from './Hello';
import { categoriesStub } from './categoriesStub';
import { welcomeStub } from './welcomeStub';
import { SetupPage } from './SetupPage';

function client(me: Promise<MeResult>) {
  return {
    ...categoriesStub,
    ...welcomeStub,
    me: { query: () => me },
    setupProgress: { query: () => Promise.resolve([]) },
    saveSetupStep: { mutate: vi.fn() },
  };
}

describe('P1-08 SetupPage', () => {
  it('shows the wizard for the household once me has loaded', async () => {
    const me = {
      user: { name: 'Sam', email: 's@example.com' },
      household: { name: 'The Examples', role: 'owner' },
    } as MeResult;
    render(<SetupPage client={client(Promise.resolve(me))} onExit={() => {}} />);

    expect(screen.getByRole('status').textContent).toBe('Loading…');
    expect(await screen.findByText('Set up The Examples')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save & continue' })).toBeInTheDocument();
  });

  it('a view-only member gets a wizard without save buttons', async () => {
    const me = {
      user: { name: 'Vic', email: 'v@example.com' },
      household: { name: 'The Examples', role: 'view' },
    } as MeResult;
    render(<SetupPage client={client(Promise.resolve(me))} onExit={() => {}} />);

    await screen.findByText('Step 1 of 9');
    expect(screen.queryByRole('button', { name: 'Save & continue' })).not.toBeInTheDocument();
  });

  it('shows a generic error when me fails or there is no household', async () => {
    const { unmount } = render(
      <SetupPage client={client(Promise.reject(new Error('boom')))} onExit={() => {}} />,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    unmount();

    render(
      <SetupPage
        client={client(Promise.resolve({ user: null, household: null }))}
        onExit={() => {}}
      />,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
  });
});
