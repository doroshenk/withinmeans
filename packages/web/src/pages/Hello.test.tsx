import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Hello, type ExportResult, type MeResult } from './Hello';

const exported: ExportResult = {
  version: 1,
  exportedAt: '2026-11-18T12:00:00Z',
  exportedOn: '2026-11-18',
  tables: { households: [{ name: 'The Examples' }] },
};

function clientReturning(
  result: Promise<MeResult>,
  exportData: () => Promise<ExportResult> = () => Promise.resolve(exported),
) {
  return { me: { query: vi.fn(() => result) }, exportData: { query: vi.fn(exportData) } };
}

const member = (role: 'owner' | 'view') =>
  Promise.resolve({
    user: { name: 'Sam', email: 'sam@example.com' },
    household: { name: 'The Examples', role },
  } as MeResult);

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

  it.each(['owner', 'view'] as const)(
    'P1-14: Download my data saves the export as a dated JSON file (%s)',
    async (role) => {
      const client = clientReturning(member(role));
      const saveFile = vi.fn((_name: string, _text: string) => {});
      render(<Hello client={client} saveFile={saveFile} />);

      await userEvent.click(await screen.findByRole('button', { name: 'Download my data' }));

      expect(client.exportData.query).toHaveBeenCalledOnce();
      expect(saveFile).toHaveBeenCalledOnce();
      const [name, text] = saveFile.mock.calls[0] ?? ['', ''];
      expect(name).toBe('within-means-2026-11-18.json');
      expect(JSON.parse(text)).toEqual(exported);
    },
  );

  it('P1-14: no download without a household', async () => {
    render(<Hello client={clientReturning(Promise.resolve({ user: null, household: null }))} />);

    await screen.findByRole('heading', { name: 'Hello there' });
    expect(screen.queryByRole('button', { name: 'Download my data' })).not.toBeInTheDocument();
  });

  it('P1-14: the button is off while the export is being prepared', async () => {
    const client = clientReturning(member('owner'), () => new Promise(() => {}));
    render(<Hello client={client} saveFile={vi.fn()} />);

    const button = await screen.findByRole('button', { name: 'Download my data' });
    await userEvent.click(button);

    expect(button).toBeDisabled();
  });

  it('P1-14: a failed download shows an error and can be tried again', async () => {
    let calls = 0;
    const client = clientReturning(member('owner'), () =>
      ++calls === 1 ? Promise.reject(new Error('boom')) : Promise.resolve(exported),
    );
    const saveFile = vi.fn();
    render(<Hello client={client} saveFile={saveFile} />);
    const button = await screen.findByRole('button', { name: 'Download my data' });

    await userEvent.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');

    await userEvent.click(button);
    expect(saveFile).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
