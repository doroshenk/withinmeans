import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Hello, type MeResult } from './Hello';

function clientReturning(result: Promise<MeResult>) {
  return { me: { query: vi.fn(() => result) } };
}

describe('Hello', () => {
  it('renders the name returned by me', async () => {
    const client = clientReturning(
      Promise.resolve({
        user: { name: 'Sam', email: 'sam@example.com' },
        household: { name: 'The Examples', role: 'full' },
      } as MeResult),
    );
    render(<Hello client={client} />);

    expect(await screen.findByRole('heading', { name: 'Hello Sam' })).toBeInTheDocument();
    expect(client.me.query).toHaveBeenCalledOnce();
  });

  it('says hello without a name when the user has no profile yet', async () => {
    render(<Hello client={clientReturning(Promise.resolve({ user: null, household: null }))} />);

    expect(await screen.findByRole('heading', { name: 'Hello there' })).toBeInTheDocument();
  });

  it('shows a status while loading', () => {
    render(<Hello client={clientReturning(new Promise(() => {}))} />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading');
  });

  it('P1-07: the loading text is exactly "Loading…" (a real ellipsis, no corrupted character)', () => {
    render(<Hello client={clientReturning(new Promise(() => {}))} />);

    expect(screen.getByRole('status').textContent).toBe('Loading…');
  });

  it('shows a generic error with role="alert" when me fails', async () => {
    render(<Hello client={clientReturning(Promise.reject(new Error('boom')))} />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
  });

  it('P1-08: a member who can write sees "Start setting up", which opens the wizard', async () => {
    const onStartSetup = vi.fn();
    const me = {
      user: { name: 'Sam', email: 'sam@example.com' },
      household: { name: 'X', role: 'owner' },
    };
    render(
      <Hello
        client={clientReturning(Promise.resolve(me as MeResult))}
        onStartSetup={onStartSetup}
      />,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Start setting up' }));

    expect(onStartSetup).toHaveBeenCalledOnce();
  });

  it('P1-08: a view-only member does not see "Start setting up"', async () => {
    const me = {
      user: { name: 'Vic', email: 'v@example.com' },
      household: { name: 'X', role: 'view' },
    };
    render(
      <Hello client={clientReturning(Promise.resolve(me as MeResult))} onStartSetup={() => {}} />,
    );

    await screen.findByRole('heading', { name: 'Hello Vic' });
    expect(screen.queryByRole('button', { name: 'Start setting up' })).not.toBeInTheDocument();
  });
});
