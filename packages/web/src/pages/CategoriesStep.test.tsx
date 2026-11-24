import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RoleProvider, type Role } from '../permissions';
import { CategoriesStep, type CategoriesClient, type CategoryRow } from './CategoriesStep';

const DEFAULTS = ['Housing', 'Utilities', 'Home', 'Insurance', 'Savings', 'Subscriptions', 'Auto'];

/** A fake API that keeps its own list, like the real one, so the screen's reloads are testable. */
function fakeClient(options: { names?: string[]; billCounts?: Record<string, number> } = {}) {
  let rows: CategoryRow[] = (options.names ?? []).map((name, i) => ({
    id: `id-${name}`,
    name,
    colorIndex: i % 9,
    billCount: options.billCounts?.[name] ?? 0,
  }));
  const calls = {
    seed: vi.fn(),
    create: vi.fn(),
    rename: vi.fn(),
    recolor: vi.fn(),
    remove: vi.fn(),
  };
  const client: CategoriesClient = {
    categories: { query: () => Promise.resolve(rows.map((r) => ({ ...r }))) },
    seedDefaultCategories: {
      mutate: (input) => {
        calls.seed(input);
        if (rows.length === 0) {
          rows = DEFAULTS.map((name, i) => ({
            id: `id-${name}`,
            name,
            colorIndex: i,
            billCount: 0,
          }));
        }
        return Promise.resolve({});
      },
    },
    createCategory: {
      mutate: (input) => {
        calls.create(input);
        const row = {
          id: `id-${input.name}`,
          name: input.name,
          colorIndex: input.colorIndex,
          billCount: 0,
        };
        rows = [...rows, row];
        return Promise.resolve({ id: row.id });
      },
    },
    renameCategory: {
      mutate: (input) => {
        calls.rename(input);
        rows = rows.map((r) => (r.id === input.id ? { ...r, name: input.name } : r));
        return Promise.resolve({});
      },
    },
    recolorCategory: {
      mutate: (input) => {
        calls.recolor(input);
        rows = rows.map((r) => (r.id === input.id ? { ...r, colorIndex: input.colorIndex } : r));
        return Promise.resolve({});
      },
    },
    deleteCategory: {
      mutate: (input) => {
        calls.remove(input);
        const gone = rows.find((r) => r.id === input.id);
        const first = rows.find((r) => r.id !== input.id);
        rows = rows.filter((r) => r.id !== input.id);
        const moved = gone?.billCount ?? 0;
        if (first !== undefined) first.billCount += moved;
        return Promise.resolve({
          movedCount: moved,
          movedToName: first?.name ?? '',
          message:
            moved === 0
              ? null
              : `Moved ${moved} bill${moved === 1 ? '' : 's'} to ${first?.name ?? ''}.`,
        });
      },
    },
  };
  return { client, calls };
}

function open(client: CategoriesClient, role: Role = 'owner') {
  render(
    <RoleProvider role={role}>
      <CategoriesStep client={client} />
    </RoleProvider>,
  );
  return userEvent.setup();
}

const nameBox = (name: string) => screen.getByRole('textbox', { name: `Name of ${name}` });

describe('P1-11 bill categories step', () => {
  it('starts a new household with the 7 default categories', async () => {
    const { client, calls } = fakeClient();
    open(client);

    expect(await screen.findByRole('textbox', { name: 'Name of Housing' })).toBeInTheDocument();
    for (const name of DEFAULTS) expect(nameBox(name)).toBeInTheDocument();
    expect(calls.seed).toHaveBeenCalledWith({ preset: 'default' });
  });

  it('does not seed when the household already has categories', async () => {
    const { client, calls } = fakeClient({ names: ['Housing', 'Pets'] });
    open(client);

    await screen.findByRole('textbox', { name: 'Name of Pets' });
    expect(calls.seed).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox', { name: 'Name of Home' })).not.toBeInTheDocument();
  });

  it('shows how many bills use each category', async () => {
    const { client } = fakeClient({
      names: ['Housing', 'Utilities', 'Auto'],
      billCounts: { Housing: 1, Utilities: 3 },
    });
    open(client);

    await screen.findByRole('textbox', { name: 'Name of Housing' });
    expect(screen.getByText('1 bill')).toBeInTheDocument();
    expect(screen.getByText('3 bills')).toBeInTheDocument();
    expect(screen.getByText('Not used yet')).toBeInTheDocument();
  });

  it('adds a category from the name box', async () => {
    const { client, calls } = fakeClient({ names: ['Housing'] });
    const user = open(client);
    await screen.findByRole('textbox', { name: 'Name of Housing' });

    await user.type(screen.getByRole('textbox', { name: 'New category' }), '  Pets ');
    await user.click(screen.getByRole('button', { name: 'Add category' }));

    expect(await screen.findByRole('textbox', { name: 'Name of Pets' })).toBeInTheDocument();
    expect(calls.create).toHaveBeenCalledWith({ name: 'Pets', colorIndex: 1 });
    expect(screen.getByRole('textbox', { name: 'New category' })).toHaveValue('');
  });

  it('adds a suggestion in one tap, and the suggestion goes away once used', async () => {
    const { client, calls } = fakeClient({ names: ['Housing'] });
    const user = open(client);
    await screen.findByRole('textbox', { name: 'Name of Housing' });

    await user.click(screen.getByRole('button', { name: '+ Medical' }));

    expect(await screen.findByRole('textbox', { name: 'Name of Medical' })).toBeInTheDocument();
    expect(calls.create).toHaveBeenCalledWith({ name: 'Medical', colorIndex: 1 });
    expect(screen.queryByRole('button', { name: '+ Medical' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Pets' })).toBeInTheDocument();
  });

  it('rejects a duplicate name ignoring case, and does not call the API', async () => {
    const { client, calls } = fakeClient({ names: ['Housing', 'Home'] });
    const user = open(client);
    await screen.findByRole('textbox', { name: 'Name of Housing' });

    await user.type(screen.getByRole('textbox', { name: 'New category' }), 'hOmE');
    await user.click(screen.getByRole('button', { name: 'Add category' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'You already have a category named "hOmE".',
    );
    expect(calls.create).not.toHaveBeenCalled();
  });

  it('rejects an empty new name', async () => {
    const { client, calls } = fakeClient({ names: ['Housing'] });
    const user = open(client);
    await screen.findByRole('textbox', { name: 'Name of Housing' });

    await user.click(screen.getByRole('button', { name: 'Add category' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Give the category a name.');
    expect(calls.create).not.toHaveBeenCalled();
  });

  it('renames a category when you leave the field', async () => {
    const { client, calls } = fakeClient({ names: ['Housing', 'Home'] });
    const user = open(client);
    await screen.findByRole('textbox', { name: 'Name of Home' });

    await user.clear(nameBox('Home'));
    await user.type(nameBox('Home'), 'House');
    await user.tab();

    await waitFor(() =>
      expect(calls.rename).toHaveBeenCalledWith({ id: 'id-Home', name: 'House' }),
    );
    expect(await screen.findByRole('textbox', { name: 'Name of House' })).toBeInTheDocument();
  });

  it('rejects renaming onto another name ignoring case, and puts the old name back', async () => {
    const { client, calls } = fakeClient({ names: ['Housing', 'Home'] });
    const user = open(client);
    await screen.findByRole('textbox', { name: 'Name of Home' });

    await user.clear(nameBox('Home'));
    await user.type(nameBox('Home'), 'HOUSING');
    await user.tab();

    expect(screen.getByRole('alert')).toHaveTextContent(
      'You already have a category named "HOUSING".',
    );
    expect(calls.rename).not.toHaveBeenCalled();
    expect(nameBox('Home')).toHaveValue('Home');
  });

  it('keeping the same name, or only changing its case, is not a duplicate of itself', async () => {
    const { client, calls } = fakeClient({ names: ['Housing', 'Home'] });
    const user = open(client);
    await screen.findByRole('textbox', { name: 'Name of Home' });

    await user.clear(nameBox('Home'));
    await user.type(nameBox('Home'), 'HOME');
    await user.tab();

    await waitFor(() => expect(calls.rename).toHaveBeenCalledWith({ id: 'id-Home', name: 'HOME' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('tapping the color swatch moves to the next palette color, wrapping after the last', async () => {
    const { client, calls } = fakeClient({ names: ['Housing'] });
    const user = open(client);
    await screen.findByRole('textbox', { name: 'Name of Housing' });

    await user.click(screen.getByRole('button', { name: 'Change color of Housing' }));

    await waitFor(() =>
      expect(calls.recolor).toHaveBeenCalledWith({ id: 'id-Housing', colorIndex: 1 }),
    );
  });

  it('T18: deleting "Home" used by 1 bill moves the bill to the first category and shows a message', async () => {
    const { client, calls } = fakeClient({
      names: ['Housing', 'Home', 'Auto'],
      billCounts: { Home: 1 },
    });
    const user = open(client);
    await screen.findByRole('textbox', { name: 'Name of Home' });

    await user.click(screen.getByRole('button', { name: 'Delete Home' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Moved 1 bill to Housing.');
    expect(calls.remove).toHaveBeenCalledWith({ id: 'id-Home' });
    expect(screen.queryByRole('textbox', { name: 'Name of Home' })).not.toBeInTheDocument();
    expect(screen.getByText('1 bill')).toBeInTheDocument();
  });

  it('deleting an unused category shows no message', async () => {
    const { client } = fakeClient({ names: ['Housing', 'Auto'] });
    const user = open(client);
    await screen.findByRole('textbox', { name: 'Name of Auto' });

    await user.click(screen.getByRole('button', { name: 'Delete Auto' }));

    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: 'Name of Auto' })).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('at least one category is required: the last one cannot be deleted', async () => {
    const { client } = fakeClient({ names: ['Housing'] });
    open(client);
    await screen.findByRole('textbox', { name: 'Name of Housing' });

    expect(screen.getByRole('button', { name: 'Delete Housing' })).toBeDisabled();
  });

  it('shows a plain error when the server fails', async () => {
    const { client } = fakeClient({ names: ['Housing', 'Home'] });
    client.deleteCategory.mutate = () => Promise.reject(new Error('boom'));
    const user = open(client);
    await screen.findByRole('textbox', { name: 'Name of Home' });

    await user.click(screen.getByRole('button', { name: 'Delete Home' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
    expect(nameBox('Home')).toBeInTheDocument();
  });

  it('a view-only member sees the categories but no way to change them', async () => {
    const { client, calls } = fakeClient({ names: ['Housing', 'Home'] });
    open(client, 'view');

    expect(await screen.findByRole('textbox', { name: 'Name of Home' })).toHaveAttribute(
      'readonly',
    );
    expect(screen.queryByRole('button', { name: /^Delete / })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Change color/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add category' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Medical' })).not.toBeInTheDocument();
    expect(calls.seed).not.toHaveBeenCalled();
  });
});
