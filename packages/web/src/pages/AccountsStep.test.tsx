import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RoleProvider, type Role } from '../permissions';
import { AccountsStep, type AccountRow, type AccountsClient } from './AccountsStep';

/** A fake API that keeps its own list, like the real one, so the screen's reloads are testable. */
function fakeClient(initial: AccountRow[] = [], cushionCents = 0) {
  let rows = [...initial];
  let cushion = cushionCents;
  const calls = { add: vi.fn(), remove: vi.fn(), cushion: vi.fn() };
  const client: AccountsClient = {
    setupAccounts: {
      query: () =>
        Promise.resolve({ accounts: rows.map((r) => ({ ...r })), cushionCents: cushion }),
    },
    addAccount: {
      mutate: (input) => {
        calls.add(input);
        const row: AccountRow = {
          id: `id-${input.name}`,
          name: input.name,
          type: input.type,
          balanceCents: input.balanceCents,
          isPrimaryChecking: input.type === 'checking' && !rows.some((r) => r.isPrimaryChecking),
        };
        rows = [...rows, row];
        return Promise.resolve({ id: row.id });
      },
    },
    removeAccount: {
      mutate: (input) => {
        calls.remove(input);
        rows = rows.filter((r) => r.id !== input.id);
        return Promise.resolve({});
      },
    },
    setCushion: {
      mutate: (input) => {
        calls.cushion(input);
        cushion = input.cushionCents;
        return Promise.resolve({});
      },
    },
  };
  return { client, calls };
}

const joint: AccountRow = {
  id: 'a1',
  name: 'Joint checking',
  type: 'checking',
  balanceCents: 123_456,
  isPrimaryChecking: true,
};
const rainy: AccountRow = {
  id: 'a2',
  name: 'Rainy day',
  type: 'savings',
  balanceCents: 500_000,
  isPrimaryChecking: false,
};

function open(client: AccountsClient, role: Role = 'owner') {
  render(
    <RoleProvider role={role}>
      <AccountsStep client={client} />
    </RoleProvider>,
  );
  return userEvent.setup();
}

async function fillAndAdd(
  user: ReturnType<typeof userEvent.setup>,
  fields: { name?: string; type?: string; balance?: string },
) {
  if (fields.name !== undefined) {
    await user.type(screen.getByRole('textbox', { name: 'Account name' }), fields.name);
  }
  if (fields.type !== undefined) {
    await user.selectOptions(screen.getByRole('combobox', { name: 'Type' }), fields.type);
  }
  if (fields.balance !== undefined) {
    await user.type(screen.getByRole('textbox', { name: 'Balance today' }), fields.balance);
  }
  await user.click(screen.getByRole('button', { name: 'Add account' }));
}

describe('P1-10 bank accounts step', () => {
  it('lists each account with its balance, and marks the primary checking account', async () => {
    const { client } = fakeClient([joint, rainy], 100_000);
    open(client);

    const list = await screen.findByRole('list', { name: 'Accounts' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Joint checking');
    expect(items[0]).toHaveTextContent('$1,234.56');
    expect(items[0]).toHaveTextContent('Primary checking');
    expect(items[1]).toHaveTextContent('Rainy day');
    expect(items[1]).toHaveTextContent('$5,000.00');
    expect(items[1]).not.toHaveTextContent('Primary checking');
  });

  it('shows the saved cushion', async () => {
    const { client } = fakeClient([joint], 100_000);
    open(client);

    expect(await screen.findByRole('textbox', { name: 'Checking cushion' })).toHaveValue('1000.00');
  });

  it('adds an account: type, name and balance go to the API as cents, and the list refreshes', async () => {
    const { client, calls } = fakeClient();
    const user = open(client);
    await screen.findByRole('textbox', { name: 'Account name' });

    await fillAndAdd(user, { name: ' Joint checking ', type: 'checking', balance: '1,234.56' });

    expect(calls.add).toHaveBeenCalledWith({
      name: 'Joint checking',
      type: 'checking',
      balanceCents: 123_456,
    });
    expect(await screen.findByText('Joint checking')).toBeInTheDocument();
    expect(screen.getByText('Primary checking')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Account name' })).toHaveValue('');
  });

  it('P1-10: every account needs a name', async () => {
    const { client, calls } = fakeClient();
    const user = open(client);
    await screen.findByRole('textbox', { name: 'Account name' });

    await fillAndAdd(user, { balance: '10' });

    expect(await screen.findByRole('alert')).toHaveTextContent('Give the account a name.');
    expect(calls.add).not.toHaveBeenCalled();
  });

  it('P1-10: every account needs a balance (0 is fine)', async () => {
    const { client, calls } = fakeClient();
    const user = open(client);
    await screen.findByRole('textbox', { name: 'Account name' });

    await fillAndAdd(user, { name: 'Wallet' });
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter the balance today.');
    expect(calls.add).not.toHaveBeenCalled();

    await user.type(screen.getByRole('textbox', { name: 'Balance today' }), '0');
    await user.click(screen.getByRole('button', { name: 'Add account' }));
    expect(calls.add).toHaveBeenCalledWith({ name: 'Wallet', type: 'checking', balanceCents: 0 });
  });

  it('offers checking, savings and cash', async () => {
    const { client } = fakeClient();
    open(client);

    const type = await screen.findByRole('combobox', { name: 'Type' });
    expect(
      within(type)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Checking', 'Savings', 'Cash']);
  });

  it('removes an account', async () => {
    const { client, calls } = fakeClient([joint, rainy]);
    const user = open(client);

    await user.click(await screen.findByRole('button', { name: 'Remove Rainy day' }));

    expect(calls.remove).toHaveBeenCalledWith({ id: 'a2' });
    expect(screen.queryByText('Rainy day')).not.toBeInTheDocument();
  });

  it('saves the cushion in cents when you leave the field', async () => {
    const { client, calls } = fakeClient([joint]);
    const user = open(client);
    const box = await screen.findByRole('textbox', { name: 'Checking cushion' });

    await user.clear(box);
    await user.type(box, '1,500');
    await user.tab();

    expect(calls.cushion).toHaveBeenCalledWith({ cushionCents: 150_000 });
  });

  it('does not save a cushion that is not an amount, and says so', async () => {
    const { client, calls } = fakeClient([joint]);
    const user = open(client);
    const box = await screen.findByRole('textbox', { name: 'Checking cushion' });

    await user.clear(box);
    await user.type(box, 'lots');
    await user.tab();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Enter the cushion as a dollar amount',
    );
    expect(calls.cushion).not.toHaveBeenCalled();
  });

  it('does not save a negative cushion', async () => {
    const { client, calls } = fakeClient([joint]);
    const user = open(client);
    const box = await screen.findByRole('textbox', { name: 'Checking cushion' });

    await user.clear(box);
    await user.type(box, '-5');
    await user.tab();

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(calls.cushion).not.toHaveBeenCalled();
  });

  it('shows the API error when adding fails', async () => {
    const { client } = fakeClient();
    client.addAccount = { mutate: () => Promise.reject(new Error('boom')) };
    const user = open(client);
    await screen.findByRole('textbox', { name: 'Account name' });

    await fillAndAdd(user, { name: 'Joint', balance: '5' });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
  });

  it('shows a generic error when the accounts cannot be loaded', async () => {
    const { client } = fakeClient();
    client.setupAccounts = { query: () => Promise.reject(new Error('boom')) };
    open(client);

    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
  });

  it('a view-only member sees the accounts but no controls', async () => {
    const { client } = fakeClient([joint], 100_000);
    open(client, 'view');

    expect(await screen.findByText('Joint checking')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add account' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove Joint checking' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Checking cushion' })).toHaveAttribute('readonly');
  });

  it('a view-only member with no accounts is told who sets them up', async () => {
    const { client } = fakeClient();
    open(client, 'view');

    expect(await screen.findByText(/No accounts yet/)).toBeInTheDocument();
  });
});
