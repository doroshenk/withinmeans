import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RoleProvider, type Role } from '../permissions';
import { BillsPage } from './BillsPage';
import { billsPageStub } from './billsPageStub';
import type { BillsData, BillsPageClient, BillsPageRow } from './bills/types';

const CATEGORIES = [
  { id: 'c-util', name: 'Utilities', colorIndex: 1 },
  { id: 'c-auto', name: 'Auto', colorIndex: 6 },
  { id: 'c-home', name: 'Housing', colorIndex: 0 },
];

const bill = (
  over: Partial<BillsPageRow> & { id: string | null; name: string; dueDate: string },
): BillsPageRow => ({
  categoryId: 'c-util',
  estimateCents: 1_000,
  actualCents: null,
  paid: false,
  kind: 'recurring',
  autopay: false,
  ...over,
});

const BILLS: BillsPageRow[] = [
  bill({
    id: 'b1',
    name: 'Mortgage',
    dueDate: '2026-11-01',
    categoryId: 'c-home',
    estimateCents: 185_000,
    actualCents: 185_000,
    paid: true,
    autopay: true,
  }),
  bill({ id: 'b2', name: 'Electric', dueDate: '2026-11-10', estimateCents: 16_400 }),
  bill({ id: 'b3', name: 'Water & sewer', dueDate: '2026-11-18', estimateCents: 6_800 }),
  bill({
    id: 'b4',
    name: 'Car registration',
    dueDate: '2026-11-16',
    categoryId: 'c-auto',
    estimateCents: 9_200,
    kind: 'one_time',
  }),
  bill({ id: 'b5', name: 'Streaming', dueDate: '2026-11-28', estimateCents: 3_600 }),
];

const paycheck = (day: string, receivedCents: number | null) => ({
  id: `p${day}`,
  scheduleId: 's1',
  scheduleName: 'Main job',
  accountName: 'Everyday checking',
  expectedDate: `2026-11-${day}`,
  expectedCents: 322_500,
  receivedDate: receivedCents === null ? null : `2026-11-${day}`,
  receivedCents,
});

const november = (over: Partial<BillsData> = {}): BillsData => ({
  today: '2026-11-18',
  ym: '2026-11',
  status: 'open',
  canOpen: false,
  bills: BILLS,
  categories: CATEGORIES,
  paychecks: [paycheck('06', 327_218), paycheck('20', null)],
  otherIncome: [
    { id: 'i1', type: 'side_work', amountCents: 35_000 },
    { id: 'i2', type: 'sale', amountCents: 12_000 },
    { id: 'i3', type: 'refund', amountCents: 6_420 },
  ],
  ...over,
});

/** A fake API that keeps its own month, like the real one, so the screen's reloads are testable. */
function fakeClient(options: { data?: BillsData; fail?: boolean; loadFails?: boolean } = {}) {
  let data = options.data ?? november();
  const calls = {
    query: vi.fn(),
    open: vi.fn(),
    add: vi.fn(),
    update: vi.fn(),
    paid: vi.fn(),
    remove: vi.fn(),
  };
  const done = () =>
    options.fail === true ? Promise.reject(new Error('boom')) : Promise.resolve({});
  const change = (id: string, over: (row: BillsPageRow) => Partial<BillsPageRow>) => {
    data = {
      ...data,
      bills: data.bills.map((b) => (b.id === id ? { ...b, ...over(b) } : b)),
    };
  };
  const client: BillsPageClient = {
    billsPage: {
      query: (input) => {
        calls.query(input);
        if (options.loadFails === true) return Promise.reject(new Error('boom'));
        if (input.ym !== undefined && input.ym !== data.ym) {
          return Promise.resolve(
            november({
              ym: input.ym,
              status: 'not-started',
              canOpen: input.ym === '2026-12',
              bills: [bill({ id: null, name: 'Water & sewer', dueDate: `${input.ym}-18` })],
              paychecks: [],
              otherIncome: [],
            }),
          );
        }
        return Promise.resolve(data);
      },
    },
    openMonth: {
      mutate: async (input) => {
        calls.open(input);
        await done();
        data = {
          ...data,
          status: 'open',
          canOpen: false,
          bills: data.bills.map((b, i) => ({ ...b, id: b.id ?? `new${i}` })),
        };
        return {};
      },
    },
    addBill: {
      mutate: async (input) => {
        calls.add(input);
        await done();
        const { amountCents, paid, ...rest } = input;
        data = {
          ...data,
          bills: [
            ...data.bills,
            bill({
              ...rest,
              id: 'added',
              estimateCents: amountCents,
              actualCents: paid ? amountCents : null,
              paid,
              kind: 'one_time',
            }),
          ],
        };
        return { id: 'added' };
      },
    },
    updateBill: {
      mutate: async (input) => {
        calls.update(input);
        await done();
        const { id, amountCents, ...rest } = input;
        change(id, () => ({ ...rest, actualCents: amountCents }));
        return {};
      },
    },
    setBillPaid: {
      mutate: async (input) => {
        calls.paid(input);
        await done();
        change(input.id, (b) => ({
          paid: input.paid,
          actualCents: input.paid ? b.estimateCents : null,
        }));
        return {};
      },
    },
    removeBill: {
      mutate: async (input) => {
        calls.remove(input);
        await done();
        data = { ...data, bills: data.bills.filter((b) => b.id !== input.id) };
        return {};
      },
    },
  };
  return { client, calls };
}

async function open(client: BillsPageClient, role: Role = 'owner') {
  const user = userEvent.setup();
  const onNavigate = vi.fn();
  render(
    <RoleProvider role={role}>
      <BillsPage client={client} onNavigate={onNavigate} />
    </RoleProvider>,
  );
  await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument());
  return { user, onNavigate };
}

const tile = (id: string) => screen.getByTestId(`tile-${id}`);
const region = (name: string) => screen.getByRole('region', { name });
const weekToggle = (n: number) => screen.getByRole('button', { name: new RegExp(`^Week ${n}`) });
const weekRows = (n: number) => within(region(`Week ${n}`)).queryAllByRole('listitem');
const row = (name: string) => screen.getByRole('listitem', { name });
const paidBox = (name: string) => screen.getByRole('checkbox', { name: `Paid: ${name}` });

describe('P2-06 the month', () => {
  it('heads the page with this month and its status', async () => {
    await open(fakeClient().client);

    expect(screen.getByRole('heading', { level: 1, name: 'November 2026' })).toBeInTheDocument();
    expect(screen.getByText('Bills & cash flow')).toBeInTheDocument();
    expect(screen.getByText('Open', { selector: '.chip' })).toBeInTheDocument();
  });

  it('shows the four tiles', async () => {
    await open(fakeClient().client);

    expect(tile('income')).toHaveTextContent('Paychecks & other income');
    expect(tile('income')).toHaveTextContent('$7,031.38');
    expect(tile('income')).toHaveTextContent('1 of 2 paychecks received · +$534.20 other');
    expect(tile('bills')).toHaveTextContent('Bills + cards this month');
    expect(tile('bills')).toHaveTextContent('$2,210.00');
    expect(tile('paid')).toHaveTextContent('$1,850.00');
    expect(within(tile('paid')).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '84');
    expect(tile('left')).toHaveTextContent('Left after bills');
    expect(tile('left')).toHaveTextContent('$4,821.38');
  });

  it('asks for the next and previous months', async () => {
    const { client, calls } = fakeClient();
    const { user } = await open(client);

    await user.click(screen.getByRole('button', { name: 'Next month' }));

    expect(calls.query).toHaveBeenLastCalledWith({ ym: '2026-12' });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'December 2026' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Not started')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(calls.query).toHaveBeenLastCalledWith({ ym: '2026-11' });
  });

  it('says when the page cannot load', async () => {
    await open(fakeClient({ loadFails: true }).client);

    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
  });

  it('keeps the month shown and says so when another one cannot load', async () => {
    let calls = 0;
    const { client } = fakeClient();
    const { user } = await open({
      ...client,
      billsPage: {
        query: (input) =>
          calls++ === 0 ? client.billsPage.query(input) : Promise.reject(new Error('boom')),
      },
    });

    await user.click(screen.getByRole('button', { name: 'Next month' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    expect(screen.getByRole('heading', { level: 1, name: 'November 2026' })).toBeInTheDocument();
  });
});

describe('P2-06 weeks', () => {
  it('Bills group into the right week by due date', async () => {
    const { user } = await open(fakeClient().client);
    await user.click(screen.getByRole('button', { name: 'Expand all' }));

    expect(weekRows(1).map((li) => li.getAttribute('aria-label'))).toEqual(['Mortgage']);
    expect(weekRows(2).map((li) => li.getAttribute('aria-label'))).toEqual(['Electric']);
    expect(weekRows(3).map((li) => li.getAttribute('aria-label'))).toEqual([
      'Car registration',
      'Water & sewer',
    ]);
    expect(weekRows(4).map((li) => li.getAttribute('aria-label'))).toEqual(['Streaming']);
  });

  it('starts with the current and later weeks open, and expands and collapses', async () => {
    const { user } = await open(fakeClient().client);
    const openState = () =>
      [1, 2, 3, 4].map((n) => weekToggle(n).getAttribute('aria-expanded') === 'true');

    expect(openState()).toEqual([false, false, true, true]);
    expect(screen.queryByRole('listitem', { name: 'Mortgage' })).not.toBeInTheDocument();
    await user.click(weekToggle(1));
    expect(row('Mortgage')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Collapse all' }));
    expect(openState()).toEqual([false, false, false, false]);
    await user.click(screen.getByRole('button', { name: 'Expand all' }));
    expect(openState()).toEqual([true, true, true, true]);
  });

  it('heads each week with its days, how much is paid and its total', async () => {
    await open(fakeClient().client);

    expect(weekToggle(1)).toHaveTextContent('Nov 1 – 7');
    expect(weekToggle(1)).toHaveTextContent('All paid');
    expect(weekToggle(1)).toHaveTextContent('$1,850.00');
    expect(weekToggle(3)).toHaveTextContent('This week');
    expect(weekToggle(3)).toHaveTextContent('0 of 2 paid · $160.00 left');
    expect(weekToggle(3)).toHaveTextContent('To pay');
    expect(screen.getByText('1 of 5 paid')).toBeInTheDocument();
  });

  it('says when a week has no bills', async () => {
    await open(
      fakeClient({ data: november({ bills: BILLS.filter((b) => b.name === 'Streaming') }) }).client,
    );

    expect(region('Week 3')).toHaveTextContent('Nothing due this week');
  });

  it('shows each bill with its category, kind, due date, amount and autopay', async () => {
    const { user } = await open(fakeClient().client);
    await user.click(weekToggle(1));

    expect(row('Mortgage')).toHaveTextContent('Housing');
    expect(row('Mortgage')).toHaveTextContent('Recurring');
    expect(row('Mortgage')).toHaveTextContent('Due Nov 1');
    expect(row('Mortgage')).toHaveTextContent('Autopay');
    expect(row('Mortgage')).toHaveTextContent('$1,850.00');
    expect(row('Car registration')).toHaveTextContent('One-time');
    expect(row('Car registration')).not.toHaveTextContent('Autopay');
    expect(row('Water & sewer')).toHaveTextContent('Estimate');
    expect(row('Mortgage')).not.toHaveTextContent('Estimate');
  });

  it('links to the recurring bills', async () => {
    const { user, onNavigate } = await open(fakeClient().client);

    await user.click(screen.getByRole('link', { name: 'Manage recurring bills' }));

    expect(onNavigate).toHaveBeenCalledWith('recurring');
  });
});

describe('P2-06 paid toggle', () => {
  it('Paid toggle sets actual_cents and paid_at; the tiles update', async () => {
    const { client, calls } = fakeClient();
    const { user } = await open(client);
    expect(paidBox('Water & sewer')).not.toBeChecked();

    await user.click(paidBox('Water & sewer'));

    expect(calls.paid).toHaveBeenCalledWith({ id: 'b3', paid: true });
    await waitFor(() => expect(paidBox('Water & sewer')).toBeChecked());
    expect(tile('paid')).toHaveTextContent('$1,918.00');
    expect(screen.getByText('2 of 5 paid')).toBeInTheDocument();

    await user.click(paidBox('Water & sewer'));
    expect(calls.paid).toHaveBeenLastCalledWith({ id: 'b3', paid: false });
    await waitFor(() => expect(tile('paid')).toHaveTextContent('$1,850.00'));
  });

  it('says what went wrong and leaves the bill as it was', async () => {
    const { user } = await open(fakeClient({ fail: true }).client);

    await user.click(paidBox('Water & sewer'));

    expect(await within(region('Bills, week by week')).findByRole('alert')).toBeInTheDocument();
    expect(paidBox('Water & sewer')).not.toBeChecked();
  });

  it('says the change is saved when only the reload fails', async () => {
    let calls = 0;
    const { client } = fakeClient();
    const { user } = await open({
      ...client,
      billsPage: {
        query: (input) =>
          calls++ === 0 ? client.billsPage.query(input) : Promise.reject(new Error('boom')),
      },
    });

    await user.click(paidBox('Water & sewer'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Saved');
  });
});

describe('P2-06 one-time bill form', () => {
  const form = () => screen.getByRole('form', { name: 'Add one-time bill' });
  const field = (label: string) => within(form()).getByLabelText(label);
  const start = async (client: BillsPageClient) => {
    const opened = await open(client);
    await opened.user.click(screen.getByRole('button', { name: 'Add one-time bill' }));
    return opened;
  };

  it('adds a bill still owed', async () => {
    const { client, calls } = fakeClient();
    const { user } = await start(client);
    expect(field('Due date')).toHaveValue('2026-11-18');
    expect(field('Still owed')).toBeChecked();

    await user.type(field('Bill name'), 'Tire rotation');
    await user.type(field('Amount'), '60');
    await user.clear(field('Due date'));
    await user.type(field('Due date'), '2026-11-24');
    await user.selectOptions(field('Category'), 'c-auto');
    await user.click(within(form()).getByRole('button', { name: 'Add bill' }));

    expect(calls.add).toHaveBeenCalledWith({
      name: 'Tire rotation',
      amountCents: 6_000,
      dueDate: '2026-11-24',
      categoryId: 'c-auto',
      paid: false,
    });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Added Tire rotation to week 4 of November 2026.',
    );
    expect(screen.queryByRole('form', { name: 'Add one-time bill' })).not.toBeInTheDocument();
    expect(row('Tire rotation')).toHaveTextContent('$60.00');
  });

  it('adds a bill already paid', async () => {
    const { client, calls } = fakeClient();
    const { user } = await start(client);

    await user.type(field('Bill name'), 'Tires');
    await user.type(field('Amount'), '60');
    await user.selectOptions(field('Category'), 'c-auto');
    await user.click(field('Paid'));
    await user.click(within(form()).getByRole('button', { name: 'Add bill' }));

    expect(calls.add).toHaveBeenCalledWith(expect.objectContaining({ paid: true }));
  });

  it('says what is missing and saves nothing', async () => {
    const { client, calls } = fakeClient();
    const { user } = await start(client);

    await user.click(within(form()).getByRole('button', { name: 'Add bill' }));

    expect(within(form()).getByRole('alert')).toHaveTextContent('Give the bill a name.');
    expect(calls.add).not.toHaveBeenCalled();
  });

  it('stays open with the problem when saving fails, and can be cancelled', async () => {
    const { user } = await start(fakeClient({ fail: true }).client);
    await user.type(field('Bill name'), 'Tires');
    await user.type(field('Amount'), '60');
    await user.selectOptions(field('Category'), 'c-auto');

    await user.click(within(form()).getByRole('button', { name: 'Add bill' }));

    expect(await within(form()).findByRole('alert')).toBeInTheDocument();
    expect(field('Bill name')).toHaveValue('Tires');
    await user.click(within(form()).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('form', { name: 'Add one-time bill' })).not.toBeInTheDocument();
  });

  it('starts on the first of another month', async () => {
    const { user } = await open(fakeClient().client);
    await user.click(screen.getByRole('button', { name: 'Next month' }));
    await screen.findByRole('heading', { level: 1, name: 'December 2026' });

    await user.click(screen.getByRole('button', { name: 'Add one-time bill' }));

    expect(field('Due date')).toHaveValue('2026-12-01');
  });
});

describe('P2-06 edit and delete', () => {
  it("edits this month's bill", async () => {
    const { client, calls } = fakeClient();
    const { user } = await open(client);

    await user.click(screen.getByRole('button', { name: 'Edit Water & sewer' }));
    const form = screen.getByRole('form', { name: 'Edit Water & sewer' });
    const amount = within(form).getByLabelText('Amount');
    expect(amount).toHaveValue('68.00');
    expect(form).toHaveTextContent('This changes November only');
    expect(within(form).queryByLabelText('Paid')).not.toBeInTheDocument();
    await user.clear(amount);
    await user.type(amount, '71.25');
    await user.click(within(form).getByRole('button', { name: 'Save bill' }));

    expect(calls.update).toHaveBeenCalledWith({
      id: 'b3',
      name: 'Water & sewer',
      amountCents: 7_125,
      dueDate: '2026-11-18',
      categoryId: 'c-util',
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Saved Water & sewer.');
    expect(row('Water & sewer')).toHaveTextContent('$71.25');
  });

  it('keeps an edited bill in its month', async () => {
    const { client, calls } = fakeClient();
    const { user } = await open(client);
    await user.click(screen.getByRole('button', { name: 'Edit Water & sewer' }));
    const form = screen.getByRole('form', { name: 'Edit Water & sewer' });
    const date = within(form).getByLabelText('Due date');

    await user.clear(date);
    await user.type(date, '2026-12-01');
    await user.click(within(form).getByRole('button', { name: 'Save bill' }));

    expect(within(form).getByRole('alert')).toHaveTextContent('Pick a date in November 2026.');
    expect(calls.update).not.toHaveBeenCalled();
  });

  it('asks before deleting', async () => {
    const { client, calls } = fakeClient();
    const { user } = await open(client);

    await user.click(screen.getByRole('button', { name: 'Delete Water & sewer' }));
    expect(row('Water & sewer')).toHaveTextContent('Delete Water & sewer from November?');
    await user.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(calls.remove).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Delete Water & sewer' }));
    await user.click(screen.getByRole('button', { name: 'Yes, delete' }));

    expect(calls.remove).toHaveBeenCalledWith({ id: 'b3' });
    expect(await screen.findByRole('status')).toHaveTextContent('Deleted Water & sewer.');
    expect(screen.queryByRole('listitem', { name: 'Water & sewer' })).not.toBeInTheDocument();
  });

  it('says when deleting fails', async () => {
    const { user } = await open(fakeClient({ fail: true }).client);
    await user.click(screen.getByRole('button', { name: 'Delete Water & sewer' }));

    await user.click(screen.getByRole('button', { name: 'Yes, delete' }));

    expect(await within(region('Bills, week by week')).findByRole('alert')).toBeInTheDocument();
    expect(row('Water & sewer')).toBeInTheDocument();
  });
});

describe('P2-06 a save that fails after its form was left', () => {
  /** A client whose save waits until `fail` is called. */
  function slowFailure() {
    let fail = () => {};
    const { client } = fakeClient();
    const slow: BillsPageClient = {
      ...client,
      updateBill: {
        mutate: () =>
          new Promise((_resolve, reject) => {
            fail = () => reject(new Error('boom'));
          }),
      },
    };
    return { client: slow, fail: () => fail() };
  }
  const saveWater = async (client: BillsPageClient) => {
    const opened = await open(client);
    await opened.user.click(screen.getByRole('button', { name: 'Edit Water & sewer' }));
    await opened.user.click(screen.getByRole('button', { name: 'Save bill' }));
    return opened;
  };

  it('is still reported when the form was cancelled', async () => {
    const { client, fail } = slowFailure();
    const { user } = await saveWater(client);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    act(fail);

    expect(await screen.findByRole('alert')).toHaveTextContent('Water & sewer wasn’t saved.');
  });

  it('is not shown on another bill’s form', async () => {
    const { client, fail } = slowFailure();
    const { user } = await saveWater(client);

    await user.click(screen.getByRole('button', { name: 'Edit Streaming' }));
    act(fail);

    expect(await screen.findByRole('alert')).toHaveTextContent('Water & sewer wasn’t saved.');
    const form = screen.getByRole('form', { name: 'Edit Streaming' });
    expect(within(form).queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('P2-06 side cards', () => {
  it('totals the bills by category', async () => {
    await open(fakeClient().client);
    const card = region('By category');

    expect(card).toHaveTextContent('incl. $92.00 one-time');
    expect(
      within(card)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Housing$1,850.00', 'Utilities$268.00', 'Auto$92.00']);
  });

  it('lists the paychecks and one-time income', async () => {
    const { user, onNavigate } = await open(fakeClient().client);
    const card = region('Paychecks');

    expect(card).toHaveTextContent('Nov 6');
    expect(card).toHaveTextContent('Received');
    expect(card).toHaveTextContent('$3,272.18');
    expect(card).toHaveTextContent('Expected in 2 days');
    expect(card).toHaveTextContent('$3,225.00');
    expect(card).toHaveTextContent('3 entries · side work, sale, refund');
    expect(card).toHaveTextContent('$534.20');
    await user.click(within(card).getByRole('link', { name: 'Manage income' }));
    expect(onNavigate).toHaveBeenCalledWith('paychecks');
  });

  it('says when the month has no paychecks or income', async () => {
    await open(fakeClient({ data: november({ paychecks: [], otherIncome: [] }) }).client);

    expect(region('Paychecks')).toHaveTextContent('No paychecks or income in November');
  });

  it('shows how the month adds up', async () => {
    await open(fakeClient().client);
    const card = region('How November adds up');
    const lines = within(card)
      .getAllByRole('listitem')
      .map((li) => li.textContent);

    expect(lines).toEqual([
      'Paychecks & other income$7,031.38',
      'Investments moved to checking$0.00',
      'Bills + cards−$2,210.00',
      'Net for the month$4,821.38',
    ]);
  });
});

describe('P2-06 "Open {month}"', () => {
  const preview = () =>
    november({
      status: 'not-started',
      canOpen: true,
      bills: [bill({ id: null, name: 'Water & sewer', dueDate: '2026-11-18' })],
    });

  it('"Open {month}" calls openMonth and is hidden once the month is open', async () => {
    const { client, calls } = fakeClient({ data: preview() });
    const { user } = await open(client);

    await user.click(screen.getByRole('button', { name: 'Open November' }));

    expect(calls.open).toHaveBeenCalledWith({ ym: '2026-11' });
    expect(await screen.findByRole('status')).toHaveTextContent('November is open.');
    expect(screen.queryByRole('button', { name: 'Open November' })).not.toBeInTheDocument();
    expect(paidBox('Water & sewer')).toBeInTheDocument();
  });

  it('previews a month not started, without changes to its recurring bills', async () => {
    await open(fakeClient({ data: preview() }).client);

    expect(screen.getByText(/A preview from your recurring bills/)).toBeInTheDocument();
    expect(row('Water & sewer')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^(Edit|Delete) / })).not.toBeInTheDocument();
  });

  it('is hidden when the month is open', async () => {
    await open(fakeClient().client);

    expect(screen.queryByRole('button', { name: 'Open November' })).not.toBeInTheDocument();
  });

  it('is hidden when the month cannot be opened yet', async () => {
    await open(fakeClient({ data: november({ status: 'not-started', canOpen: false }) }).client);

    expect(screen.queryByRole('button', { name: 'Open November' })).not.toBeInTheDocument();
  });

  it('says when the month cannot be opened', async () => {
    const { user } = await open(fakeClient({ data: preview(), fail: true }).client);

    await user.click(screen.getByRole('button', { name: 'Open November' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});

describe('P2-06 empty state (spec §6.14)', () => {
  const empty = (over: Partial<BillsData> = {}) =>
    november({ bills: [], paychecks: [], otherIncome: [], ...over });

  it('Main empty state shows when the month has no bills', async () => {
    const { user, onNavigate } = await open(fakeClient({ data: empty() }).client);

    expect(screen.getByRole('heading', { name: 'No bills in November yet' })).toBeInTheDocument();
    const preview = screen.getByTestId('empty-preview');
    expect(preview).toHaveTextContent('$0.00');
    expect(screen.queryByRole('region', { name: 'Bills, week by week' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add recurring bills' }));
    expect(onNavigate).toHaveBeenCalledWith('recurring');
    await user.click(screen.getByRole('button', { name: 'Add one-time bill' }));
    expect(screen.getByRole('form', { name: 'Add one-time bill' })).toBeInTheDocument();
  });

  it('keeps the income cards when there is income but no bills', async () => {
    await open(fakeClient({ data: november({ bills: [] }) }).client);

    expect(screen.getByRole('heading', { name: 'No bills in November yet' })).toBeInTheDocument();
    expect(region('Paychecks')).toHaveTextContent('$3,272.18');
    expect(region('How November adds up')).toHaveTextContent('$7,031.38');
    expect(screen.queryByTestId('empty-preview')).not.toBeInTheDocument();
  });
});

describe('P2-06 closed months and view-only members', () => {
  it('locks a closed month', async () => {
    await open(fakeClient({ data: november({ status: 'closed' }) }).client);

    expect(screen.getByText(/November is closed/)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^(Edit|Delete|Add one-time)/ }),
    ).not.toBeInTheDocument();
  });

  it('T21: hides every write control from a view-only member', async () => {
    await open(fakeClient({ data: november({ canOpen: true, status: 'open' }) }).client, 'view');

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^(Edit|Delete|Add|Open)/ }),
    ).not.toBeInTheDocument();
    expect(row('Water & sewer')).toHaveTextContent('Not paid');
  });

  it('T21: gives a view-only member no buttons on an empty or unopened month', async () => {
    await open(
      fakeClient({
        data: november({ status: 'not-started', canOpen: true, bills: [], paychecks: [] }),
      }).client,
      'view',
    );

    expect(screen.queryByRole('button', { name: /^(Add|Open)/ })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No bills in November yet' })).toBeInTheDocument();
  });

  it('works with the stub client and no navigation handler', async () => {
    render(<BillsPage client={billsPageStub} />);

    expect(
      await screen.findByRole('heading', { name: 'No bills in November yet' }),
    ).toBeInTheDocument();
  });
});
