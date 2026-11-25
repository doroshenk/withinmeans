import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RoleProvider, type Role } from '../permissions';
import {
  RecurringBillsStep,
  type BillRow,
  type RecurringBillsClient,
  type SetupBillsData,
} from './RecurringBillsStep';

const CATEGORIES = [
  { id: 'c-housing', name: 'Housing', colorIndex: 0, billCount: 0 },
  { id: 'c-utilities', name: 'Utilities', colorIndex: 1, billCount: 0 },
];

/** A fake API that keeps its own list, like the real one, so the screen's reloads are testable. */
function fakeClient(
  options: { bills?: BillRow[]; takeHomeCents?: number | null; failAdd?: boolean } = {},
) {
  let bills = options.bills ?? [];
  const calls = { add: vi.fn(), remove: vi.fn() };
  const data = (): SetupBillsData => ({
    bills: bills.map((b) => ({ ...b })),
    totalCents: bills.reduce((sum, b) => sum + b.estimateCents, 0),
    takeHomeCents: options.takeHomeCents ?? null,
  });
  const client: RecurringBillsClient = {
    categories: { query: () => Promise.resolve(CATEGORIES) },
    setupBills: { query: () => Promise.resolve(data()) },
    addRecurringBill: {
      mutate: (input) => {
        calls.add(input);
        if (options.failAdd === true) return Promise.reject(new Error('boom'));
        bills = [
          ...bills,
          {
            id: `id-${input.name}`,
            ...input,
            categoryName: CATEGORIES.find((c) => c.id === input.categoryId)?.name ?? '',
          },
        ];
        return Promise.resolve({ id: `id-${input.name}` });
      },
    },
    removeRecurringBill: {
      mutate: (input) => {
        calls.remove(input);
        bills = bills.filter((b) => b.id !== input.id);
        return Promise.resolve({});
      },
    },
  };
  return { client, calls };
}

const rent: BillRow = {
  id: 'b-rent',
  name: 'Rent',
  estimateCents: 150_000,
  dueDay: 1,
  categoryId: 'c-housing',
  categoryName: 'Housing',
  autopay: true,
};
const electric: BillRow = {
  id: 'b-electric',
  name: 'Electric',
  estimateCents: 12_050,
  dueDay: 20,
  categoryId: 'c-utilities',
  categoryName: 'Utilities',
  autopay: false,
};

function open(client: RecurringBillsClient, role: Role = 'owner') {
  render(
    <RoleProvider role={role}>
      <RecurringBillsStep client={client} />
    </RoleProvider>,
  );
  return userEvent.setup();
}

async function fillAndAdd(
  user: ReturnType<typeof userEvent.setup>,
  values: { name?: string; estimate?: string; day?: string },
) {
  if (values.name !== undefined) {
    const box = screen.getByRole('textbox', { name: 'Bill name' });
    await user.clear(box);
    await user.type(box, values.name);
  }
  if (values.estimate !== undefined) {
    await user.type(screen.getByRole('textbox', { name: 'Estimate' }), values.estimate);
  }
  if (values.day !== undefined) {
    await user.type(screen.getByRole('textbox', { name: 'Due day' }), values.day);
  }
  await user.click(screen.getByRole('button', { name: 'Add bill' }));
}

describe('P1-12 recurring bills step', () => {
  it('lists each bill with its estimate, due day, category and autopay', async () => {
    const { client } = fakeClient({ bills: [rent, electric] });
    open(client);

    const list = await screen.findByRole('list', { name: 'Recurring bills' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Rent');
    expect(rows[0]).toHaveTextContent('$1,500.00');
    expect(rows[0]).toHaveTextContent('Due on the 1st');
    expect(rows[0]).toHaveTextContent('Housing');
    expect(rows[0]).toHaveTextContent('Autopay');
    expect(rows[1]).not.toHaveTextContent('Autopay');
  });

  it('adds a bill with name, estimate, due day, category and autopay', async () => {
    const { client, calls } = fakeClient();
    const user = open(client);
    await screen.findByRole('textbox', { name: 'Bill name' });

    await user.selectOptions(screen.getByRole('combobox', { name: 'Category' }), 'Utilities');
    await user.click(screen.getByRole('checkbox', { name: 'Autopay' }));
    await fillAndAdd(user, { name: '  Water ', estimate: '45.50', day: '15' });

    expect(calls.add).toHaveBeenCalledWith({
      name: 'Water',
      estimateCents: 4_550,
      dueDay: 15,
      categoryId: 'c-utilities',
      autopay: true,
    });
    expect(await screen.findByText('Water')).toBeInTheDocument();
  });

  it('defaults the category to the first one and autopay to off', async () => {
    const { client, calls } = fakeClient();
    const user = open(client);
    await screen.findByRole('textbox', { name: 'Bill name' });

    await fillAndAdd(user, { name: 'Gym', estimate: '30', day: '3' });

    expect(calls.add).toHaveBeenCalledWith({
      name: 'Gym',
      estimateCents: 3_000,
      dueDay: 3,
      categoryId: 'c-housing',
      autopay: false,
    });
  });

  it('estimate must be > 0: shows a message and saves nothing', async () => {
    const { client, calls } = fakeClient();
    const user = open(client);
    await screen.findByRole('textbox', { name: 'Bill name' });

    await fillAndAdd(user, { name: 'Gym', estimate: '0', day: '3' });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Enter an estimate greater than $0.',
    );
    expect(calls.add).not.toHaveBeenCalled();
  });

  it('due day 1–28 only: 29 is refused with a message', async () => {
    const { client, calls } = fakeClient();
    const user = open(client);
    await screen.findByRole('textbox', { name: 'Bill name' });

    await fillAndAdd(user, { name: 'Gym', estimate: '30', day: '29' });

    expect(await screen.findByRole('alert')).toHaveTextContent('Pick a due day from 1 to 28.');
    expect(calls.add).not.toHaveBeenCalled();
  });

  it('a name is required', async () => {
    const { client, calls } = fakeClient();
    const user = open(client);
    await screen.findByRole('textbox', { name: 'Bill name' });

    await fillAndAdd(user, { estimate: '30', day: '3' });

    expect(await screen.findByRole('alert')).toHaveTextContent('Give the bill a name.');
    expect(calls.add).not.toHaveBeenCalled();
  });

  it('shows a message when saving fails, and keeps what was typed', async () => {
    const { client } = fakeClient({ failAdd: true });
    const user = open(client);
    await screen.findByRole('textbox', { name: 'Bill name' });

    await fillAndAdd(user, { name: 'Gym', estimate: '30', day: '3' });

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Bill name' })).toHaveValue('Gym');
  });

  it('removes a bill', async () => {
    const { client, calls } = fakeClient({ bills: [rent, electric] });
    const user = open(client);

    await user.click(await screen.findByRole('button', { name: 'Remove Rent' }));

    expect(calls.remove).toHaveBeenCalledWith({ id: 'b-rent' });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Remove Rent' })).toBeNull());
    expect(screen.getByRole('button', { name: 'Remove Electric' })).toBeInTheDocument();
  });

  it('suggestions: tapping one fills the name; a used one is crossed out and disabled', async () => {
    const { client } = fakeClient({ bills: [rent] });
    const user = open(client);

    const used = await screen.findByRole('button', { name: 'Rent' });
    expect(used).toBeDisabled();
    expect(used).toHaveClass('suggestion-used');

    const mortgage = screen.getByRole('button', { name: 'Mortgage' });
    expect(mortgage).toBeEnabled();
    await user.click(mortgage);
    expect(screen.getByRole('textbox', { name: 'Bill name' })).toHaveValue('Mortgage');
  });

  it('adding a suggested bill crosses its suggestion out', async () => {
    const { client } = fakeClient();
    const user = open(client);
    await screen.findByRole('textbox', { name: 'Bill name' });

    await user.click(screen.getByRole('button', { name: 'Gym' }));
    await fillAndAdd(user, { estimate: '30', day: '3' });

    await screen.findByRole('list', { name: 'Recurring bills' });
    expect(screen.getByRole('button', { name: 'Gym' })).toBeDisabled();
  });

  it('shows the total per month, and "—" for the share of take-home until paychecks exist', async () => {
    const { client } = fakeClient({ bills: [rent, electric] });
    open(client);

    expect(await screen.findByText('$1,620.50')).toBeInTheDocument();
    expect(screen.getByText('Total per month')).toBeInTheDocument();
    expect(screen.getByText('Share of take-home pay')).toBeInTheDocument();
    expect(screen.getByTestId('bills-share')).toHaveTextContent('—');
  });

  it('shows the share of take-home once there is take-home pay', async () => {
    const { client } = fakeClient({ bills: [rent, electric], takeHomeCents: 600_000 });
    open(client);

    await screen.findByText('$1,620.50');
    expect(screen.getByTestId('bills-share')).toHaveTextContent('27%');
  });

  it('with no bills yet: invites the first one, and the total is $0.00', async () => {
    const { client } = fakeClient();
    open(client);

    expect(await screen.findByText(/No recurring bills yet/)).toBeInTheDocument();
    expect(screen.getByTestId('bills-total')).toHaveTextContent('$0.00');
  });

  it('a view-only member sees the bills but no form, suggestions or remove buttons', async () => {
    const { client } = fakeClient({ bills: [rent] });
    open(client, 'view');

    await screen.findByText('Rent');
    expect(screen.queryByRole('textbox', { name: 'Bill name' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add bill' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mortgage' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove Rent' })).not.toBeInTheDocument();
  });

  it('shows an error when the bills cannot be loaded', async () => {
    const { client } = fakeClient();
    client.setupBills.query = () => Promise.reject(new Error('down'));
    open(client);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
