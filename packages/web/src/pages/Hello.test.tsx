import { render, screen } from '@testing-library/react';
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

  it('shows a generic error with role="alert" when me fails', async () => {
    render(<Hello client={clientReturning(Promise.reject(new Error('boom')))} />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
  });
});
