import type { RecurringBillItem } from '@withinmeans/domain';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RoleProvider, type Role } from '../permissions';
import type { CategoryRow } from './CategoriesStep';
import { RecurringPage, type RecurringClient } from './RecurringPage';

const CATEGORIES: CategoryRow[] = [
  { id: 'c-housing', name: 'Housing', colorIndex: 0, billCount: 1 },
  { id: 'c-utilities', name: 'Utilities', colorIndex: 1, billCount: 1 },
  { id: 'c-auto', name: 'Auto', colorIndex: 2, billCount: 0 },
];

const item = (over: Partial<RecurringBillItem> & { id: string; name: string }) => ({
  estimateCents: 10_000,
  dueDay: 1,
  categoryId: 'c-housing',
  autopay: false,
  startYm: '2026-01',
  endYm: null,
  ...over,
});

const mortgage = item({
  id: 'b-mortgage',
  name: 'Mortgage',
  estimateCents: 185_000,
  dueDay: 1,
  autopay: true,
});
const water = item({
  id: 'b-water',
  name: 'Water & sewer',
  estimateCents: 6_800,
  dueDay: 18,
  categoryId: 'c-utilities',
});
const gym = item({ id: 'b-gym', name: 'Gym', estimateCents: 3_000, endYm: '2026-10' });

/** A fake API that keeps its own lists, like the real one, so the screen's reloads are testable. */
function fakeClient(
  options: { bills?: RecurringBillItem[]; takeHomeCents?: number | null; fail?: boolean } = {},
) {
  let bills = options.bills ?? [mortgage, water, gym];
  let categories = CATEGORIES;
  const calls = {
    add: vi.fn(),
    update: vi.fn(),
    end: vi.fn(),
    restart: vi.fn(),
    remove: vi.fn(),
    createCategory: vi.fn(),
    renameCategory: vi.fn(),
    recolorCategory: vi.fn(),
    deleteCategory: vi.fn(),
  };
  const done = () =>
    options.fail === true ? Promise.reject(new Error('boom')) : Promise.resolve({});
  const patch = (id: string, change: Partial<RecurringBillItem>) => {
    bills = bills.map((b) => (b.id === id ? { ...b, ...change } : b));
  };
  const client: RecurringClient = {
    recurringBills: {
      query: () =>
        Promise.resolve({
          today: '2026-11-18',
          bills,
          usedCategoryIds: [...new Set(bills.map((b) => b.categoryId))],
          takeHomeCents: options.takeHomeCents ?? null,
        }),
    },
    categories: { query: () => Promise.resolve(categories) },
    addRecurringBill: {
      mutate: async (input) => {
        calls.add(input);
        await done();
        bills = [...bills, item({ id: 'b-new', ...input })];
        return { id: 'b-new' };
      },
    },
    updateRecurringBill: {
      mutate: async (input) => {
        calls.update(input);
        await done();
        patch(input.id, input);
      },
    },
    endRecurringBill: {
      mutate: async (input) => {
        calls.end(input);
        await done();
        patch(input.id, { endYm: '2026-11' });
      },
    },
    restartRecurringBill: {
      mutate: async (input) => {
        calls.restart(input);
        await done();
        patch(input.id, { endYm: null });
      },
    },
    removeRecurringBill: {
      mutate: async (input) => {
        calls.remove(input);
        await done();
        bills = bills.filter((b) => b.id !== input.id);
      },
    },
    createCategory: {
      mutate: async (input) => {
        calls.createCategory(input);
        categories = [...categories, { id: 'c-new', ...input, billCount: 0 }];
        return { id: 'c-new' };
      },
    },
    renameCategory: {
      mutate: async (input) => {
        calls.renameCategory(input);
        categories = categories.map((c) => (c.id === input.id ? { ...c, name: input.name } : c));
      },
    },
    recolorCategory: {
      mutate: async (input) => {
        calls.recolorCategory(input);
      },
    },
    deleteCategory: {
      mutate: async (input) => {
        calls.deleteCategory(input);
        await done();
        const to = categories.find((c) => c.id === input.moveToId);
        categories = categories.filter((c) => c.id !== input.id);
        bills = bills.map((b) =>
          b.categoryId === input.id ? { ...b, categoryId: to?.id ?? '' } : b,
        );
        return {
          movedCount: to ? 1 : 0,
          movedToName: to?.name ?? '',
          message: to ? `Moved 1 bill to ${to.name}.` : null,
        };
      },
    },
  };
  return { client, calls };
}

async function open(client: RecurringClient, role: Role = 'owner') {
  const user = userEvent.setup();
  render(
    <RoleProvider role={role}>
      <RecurringPage client={client} />
    </RoleProvider>,
  );
  await screen.findByRole('heading', { level: 1, name: 'Recurring bills' });
  await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument());
  return user;
}

const table = () => screen.getByRole('table', { name: 'All recurring bills' });
const rowNames = () =>
  within(table())
    .getAllByRole('rowheader')
    .map((c) => c.textContent);

describe('P2-08 Recurring bills page', () => {
  it('shows the summary tiles', async () => {
    await open(fakeClient({ takeHomeCents: 645_000 }).client);

    expect(screen.getByTestId('tile-total')).toHaveTextContent('$1,918');
    expect(screen.getByTestId('tile-total')).toHaveTextContent('2 bills');
    expect(screen.getByTestId('tile-share')).toHaveTextContent('30%');
    expect(screen.getByTestId('tile-share')).toHaveTextContent('of $6,450 / month');
    expect(screen.getByTestId('tile-autopay')).toHaveTextContent('1 of 2');
    expect(screen.getByTestId('tile-autopay')).toHaveTextContent('1 you pay by hand');
    expect(screen.getByTestId('tile-next')).toHaveTextContent('Water & sewer');
    expect(screen.getByTestId('tile-next')).toHaveTextContent('Due today · $68');
  });

  it('shows "—" for the share of job income until there are paychecks', async () => {
    await open(fakeClient().client);

    expect(screen.getByTestId('tile-share')).toHaveTextContent('—');
  });

  it('shows what hits in each week of the month', async () => {
    await open(fakeClient().client);

    const week1 = screen.getByRole('listitem', { name: 'Week 1' });
    expect(week1).toHaveTextContent('$1,850');
    expect(week1).toHaveTextContent('Mortgage · 1st');
    const week3 = screen.getByRole('listitem', { name: 'Week 3' });
    expect(week3).toHaveTextContent('Water & sewer · 18th');
    expect(screen.getByRole('listitem', { name: 'Week 2' })).toHaveTextContent('$0');
  });

  it('lists the active bills next due first, with a total', async () => {
    await open(fakeClient().client);

    expect(rowNames()).toEqual(['Water & sewer', 'Mortgage']);
    const row = within(table()).getByRole('row', { name: /Water & sewer/ });
    for (const text of ['Utilities', '$68.00', 'The 18th', 'Wed, Nov 18', 'Due today', 'You pay']) {
      expect(row).toHaveTextContent(text);
    }
    expect(within(table()).getByRole('row', { name: /Mortgage/ })).toHaveTextContent('Autopay');
    expect(screen.getByTestId('bills-footer')).toHaveTextContent('All 2 bills');
    expect(screen.getByTestId('bills-footer')).toHaveTextContent('$1,918.00 / month');
  });

  it('filters by category and sorts', async () => {
    const user = await open(fakeClient().client);
    const filters = screen.getByRole('group', { name: 'Filter by category' });

    await user.selectOptions(screen.getByLabelText('Sort'), 'Amount');
    expect(rowNames()).toEqual(['Mortgage', 'Water & sewer']);

    await user.click(within(filters).getByRole('button', { name: 'Utilities' }));
    expect(rowNames()).toEqual(['Water & sewer']);
    expect(screen.getByTestId('bills-footer')).toHaveTextContent('1 bill');
    expect(screen.getByTestId('bills-footer')).toHaveTextContent('$68.00 / month');

    await user.click(within(filters).getByRole('button', { name: 'Auto' }));
    expect(screen.getByText('No bills in this category.')).toBeInTheDocument();

    await user.click(within(filters).getByRole('button', { name: 'All' }));
    expect(rowNames()).toHaveLength(2);
  });

  it('adds a bill', async () => {
    const { client, calls } = fakeClient();
    const user = await open(client);

    await user.click(screen.getByRole('button', { name: 'Add recurring bill' }));
    const form = screen.getByRole('form', { name: 'Add recurring bill' });
    await user.type(within(form).getByLabelText('Bill name'), 'Internet');
    await user.type(within(form).getByLabelText('Estimate'), '80');
    await user.type(within(form).getByLabelText('Due day'), '10');
    await user.selectOptions(within(form).getByLabelText('Category'), 'Utilities');
    await user.click(within(form).getByLabelText('Autopay'));
    await user.click(within(form).getByRole('button', { name: 'Save bill' }));

    expect(calls.add).toHaveBeenCalledWith({
      name: 'Internet',
      estimateCents: 8_000,
      dueDay: 10,
      categoryId: 'c-utilities',
      autopay: true,
    });
    await waitFor(() => expect(rowNames()).toContain('Internet'));
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
  });

  it('checks the draft before saving', async () => {
    const { client, calls } = fakeClient();
    const user = await open(client);

    await user.click(screen.getByRole('button', { name: 'Add recurring bill' }));
    await user.click(screen.getByRole('button', { name: 'Save bill' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Give the bill a name.');
    expect(calls.add).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
  });

  it('keeps the form and shows an error when saving fails', async () => {
    const user = await open(fakeClient({ fail: true }).client);

    await user.click(screen.getByRole('button', { name: 'Edit Mortgage' }));
    await user.click(screen.getByRole('button', { name: 'Save bill' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    expect(screen.getByRole('form', { name: 'Edit Mortgage' })).toBeInTheDocument();
  });

  it('edits a bill, starting from what it has', async () => {
    const { client, calls } = fakeClient();
    const user = await open(client);

    await user.click(screen.getByRole('button', { name: 'Edit Mortgage' }));
    const form = screen.getByRole('form', { name: 'Edit Mortgage' });
    expect(within(form).getByLabelText('Estimate')).toHaveValue('1850.00');
    expect(within(form).getByLabelText('Due day')).toHaveValue('1');
    await user.clear(within(form).getByLabelText('Estimate'));
    await user.type(within(form).getByLabelText('Estimate'), '1900');
    await user.click(within(form).getByRole('button', { name: 'Save bill' }));

    expect(calls.update).toHaveBeenCalledWith({
      id: 'b-mortgage',
      name: 'Mortgage',
      estimateCents: 190_000,
      dueDay: 1,
      categoryId: 'c-housing',
      autopay: true,
    });
    await waitFor(() => expect(table()).toHaveTextContent('$1,900.00'));
  });

  it('deletes a bill only after a confirmation', async () => {
    const { client, calls } = fakeClient();
    const user = await open(client);

    await user.click(screen.getByRole('button', { name: 'Edit Mortgage' }));
    await user.click(screen.getByRole('button', { name: 'Delete bill' }));
    expect(screen.getByText(/Delete Mortgage\?/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(calls.remove).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Delete bill' }));
    await user.click(screen.getByRole('button', { name: 'Yes, delete' }));

    expect(calls.remove).toHaveBeenCalledWith({ id: 'b-mortgage' });
    await waitFor(() => expect(rowNames()).toEqual(['Water & sewer']));
  });

  it('ends a bill, which moves to Ended bills, and restarts it', async () => {
    const { client, calls } = fakeClient();
    const user = await open(client);
    const ended = () => screen.getByRole('list', { name: 'Ended bills' });
    expect(ended()).toHaveTextContent('Gym');

    await user.click(screen.getByRole('button', { name: 'Edit Mortgage' }));
    await user.click(screen.getByRole('button', { name: 'End bill' }));

    expect(calls.end).toHaveBeenCalledWith({ id: 'b-mortgage' });
    await waitFor(() => expect(ended()).toHaveTextContent('Mortgage'));
    expect(rowNames()).toEqual(['Water & sewer']);

    await user.click(screen.getByRole('button', { name: 'Restart Mortgage' }));

    expect(calls.restart).toHaveBeenCalledWith({ id: 'b-mortgage' });
    await waitFor(() => expect(rowNames()).toContain('Mortgage'));
  });

  it('empty: one main button and a preview showing $0.00', async () => {
    const user = await open(fakeClient({ bills: [] }).client);

    expect(screen.getByRole('heading', { name: 'No recurring bills yet' })).toBeInTheDocument();
    expect(screen.getByTestId('recurring-preview')).toHaveTextContent('$0.00');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add your first bill' }));
    expect(screen.getByRole('form', { name: 'Add recurring bill' })).toBeInTheDocument();
  });

  it('shows a generic error when loading fails', async () => {
    const { client } = fakeClient();
    client.recurringBills.query = () => Promise.reject(new Error('boom'));
    render(<RecurringPage client={client} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
  });

  it('T21: a view-only member sees the bills and no create, edit or delete control', async () => {
    await open(fakeClient().client, 'view');

    expect(rowNames()).toHaveLength(2);
    expect(
      screen.queryByRole('button', { name: /add|edit|delete|end|restart|manage|save/i }),
    ).not.toBeInTheDocument();
  });

  it('T21: the empty state offers a view-only member nothing to press', async () => {
    await open(fakeClient({ bills: [] }).client, 'view');

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('P2-08 categories manager', () => {
  async function manage(options?: Parameters<typeof fakeClient>[0]) {
    const fake = fakeClient(options);
    const user = await open(fake.client);
    await user.click(screen.getByRole('button', { name: 'Manage categories' }));
    const panel = () => screen.getByRole('region', { name: 'Categories' });
    return { ...fake, user, panel };
  }

  it('opens and closes, showing each category’s bills and monthly total', async () => {
    const { user, panel } = await manage();

    expect(panel()).toHaveTextContent('1 bill · $1,850 / month');
    expect(panel()).toHaveTextContent('No bills yet');
    await user.click(within(panel()).getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('region', { name: 'Categories' })).not.toBeInTheDocument();
  });

  it('adds a category with the chosen color', async () => {
    const { user, panel, calls } = await manage();

    await user.type(within(panel()).getByLabelText('New category'), 'Pets');
    await user.click(within(panel()).getByRole('radio', { name: 'Color 6' }));
    await user.click(within(panel()).getByRole('button', { name: 'Add category' }));

    expect(calls.createCategory).toHaveBeenCalledWith({ name: 'Pets', colorIndex: 5 });
    await waitFor(() => expect(panel()).toHaveTextContent('Pets'));
  });

  it('rejects a name already used, ignoring case', async () => {
    const { user, panel, calls } = await manage();

    await user.type(within(panel()).getByLabelText('New category'), 'housing');
    await user.click(within(panel()).getByRole('button', { name: 'Add category' }));

    expect(screen.getByRole('alert')).toHaveTextContent('already have a category');
    expect(calls.createCategory).not.toHaveBeenCalled();
  });

  it('renames and recolors', async () => {
    const { user, panel, calls } = await manage();

    await user.click(within(panel()).getByRole('button', { name: 'Edit Housing' }));
    const form = screen.getByRole('form', { name: 'Edit Housing' });
    await user.clear(within(form).getByLabelText('Category name'));
    await user.type(within(form).getByLabelText('Category name'), 'Home loan');
    await user.click(within(form).getByRole('radio', { name: 'Color 4' }));
    await user.click(within(form).getByRole('button', { name: 'Save category' }));

    expect(calls.renameCategory).toHaveBeenCalledWith({ id: 'c-housing', name: 'Home loan' });
    expect(calls.recolorCategory).toHaveBeenCalledWith({ id: 'c-housing', colorIndex: 3 });
    await waitFor(() => expect(panel()).toHaveTextContent('Home loan'));
  });

  it('Category delete requires choosing where its bills move', async () => {
    const { user, panel, calls } = await manage();

    await user.click(within(panel()).getByRole('button', { name: 'Delete Housing' }));
    const confirm = within(panel()).getByRole('button', { name: 'Delete category' });
    expect(confirm).toBeDisabled();
    await user.click(confirm);
    expect(calls.deleteCategory).not.toHaveBeenCalled();

    const target = within(panel()).getByLabelText('Move its bills to');
    expect(within(target).queryByRole('option', { name: 'Housing' })).not.toBeInTheDocument();
    await user.selectOptions(target, 'Auto');
    await user.click(confirm);

    expect(calls.deleteCategory).toHaveBeenCalledWith({ id: 'c-housing', moveToId: 'c-auto' });
    expect(await screen.findByText('Moved 1 bill to Auto.')).toHaveAttribute('role', 'status');
  });

  it('an unused category only asks for confirmation', async () => {
    const { user, panel, calls } = await manage();

    await user.click(within(panel()).getByRole('button', { name: 'Delete Auto' }));
    expect(within(panel()).queryByLabelText('Move its bills to')).not.toBeInTheDocument();
    await user.click(within(panel()).getByRole('button', { name: 'Delete category' }));

    expect(calls.deleteCategory).toHaveBeenCalledWith({ id: 'c-auto' });
    await waitFor(() => expect(panel()).not.toHaveTextContent('Auto'));
  });

  it('a delete can be cancelled', async () => {
    const { user, panel, calls } = await manage();

    await user.click(within(panel()).getByRole('button', { name: 'Delete Auto' }));
    await user.click(within(panel()).getByRole('button', { name: 'Cancel' }));

    expect(within(panel()).queryByRole('button', { name: 'Delete category' })).toBeNull();
    expect(calls.deleteCategory).not.toHaveBeenCalled();
  });
});

describe('P2-08 review fixes', () => {
  async function editThenManage() {
    const fake = fakeClient();
    const user = await open(fake.client);
    await user.click(screen.getByRole('button', { name: 'Edit Mortgage' }));
    await user.click(screen.getByRole('button', { name: 'Manage categories' }));
    return { ...fake, user };
  }

  it('an open bill form follows its bill when the category is deleted', async () => {
    const { user, calls } = await editThenManage();

    await user.click(screen.getByRole('button', { name: 'Delete Housing' }));
    await user.selectOptions(screen.getByLabelText('Move its bills to'), 'Auto');
    await user.click(screen.getByRole('button', { name: 'Delete category' }));
    await screen.findByText('Moved 1 bill to Auto.');
    await user.click(screen.getByRole('button', { name: 'Save bill' }));

    expect(calls.update).toHaveBeenCalledWith(expect.objectContaining({ categoryId: 'c-auto' }));
  });

  it('an add form opened with no categories uses the one added afterwards', async () => {
    const { client, calls } = fakeClient({ bills: [] });
    let categories: CategoryRow[] = [];
    client.categories.query = () => Promise.resolve(categories);
    client.createCategory.mutate = (input) => {
      categories = [{ id: 'c-first', ...input, billCount: 0 }];
      return Promise.resolve({ id: 'c-first' });
    };
    const user = await open(client);

    await user.click(screen.getByRole('button', { name: 'Add your first bill' }));
    await user.click(screen.getByRole('button', { name: 'Manage categories' }));
    await user.type(screen.getByLabelText('New category'), 'Pets');
    await user.click(screen.getByRole('button', { name: 'Add category' }));
    await user.type(screen.getByLabelText('Bill name'), 'Vet');
    await user.type(screen.getByLabelText('Estimate'), '20');
    await user.type(screen.getByLabelText('Due day'), '3');
    await user.click(screen.getByRole('button', { name: 'Save bill' }));

    expect(calls.add).toHaveBeenCalledWith(expect.objectContaining({ categoryId: 'c-first' }));
  });

  it('shows a category problem inside the categories panel', async () => {
    const user = await open(fakeClient().client);
    await user.click(screen.getByRole('button', { name: 'Manage categories' }));
    const panel = screen.getByRole('region', { name: 'Categories' });

    await user.click(within(panel).getByRole('button', { name: 'Add category' }));

    expect(within(panel).getByRole('alert')).toHaveTextContent('Give the category a name.');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('shows what was saved when only part of a category change fails', async () => {
    const { client } = fakeClient();
    client.recolorCategory.mutate = () => Promise.reject(new Error('boom'));
    const user = await open(client);
    await user.click(screen.getByRole('button', { name: 'Manage categories' }));
    await user.click(screen.getByRole('button', { name: 'Edit Housing' }));
    const form = screen.getByRole('form', { name: 'Edit Housing' });
    await user.clear(within(form).getByLabelText('Category name'));
    await user.type(within(form).getByLabelText('Category name'), 'Home loan');
    await user.click(within(form).getByRole('radio', { name: 'Color 4' }));

    await user.click(within(form).getByRole('button', { name: 'Save category' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    expect(await screen.findByRole('button', { name: 'Edit Home loan' })).toBeInTheDocument();
  });

  it('the empty state has an icon', async () => {
    await open(fakeClient({ bills: [] }).client);

    expect(screen.getByTestId('empty-icon')).toHaveAttribute('aria-hidden', 'true');
  });
});
