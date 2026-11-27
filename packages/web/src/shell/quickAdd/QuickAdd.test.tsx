import type { CardRow } from '@withinmeans/domain';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BillsPage } from '../../pages/BillsPage';
import { billsPageStub } from '../../pages/billsPageStub';
import type { BillsData } from '../../pages/bills/types';
import { otherIncomeStub } from '../../pages/otherIncomeStub';
import { PaychecksPage } from '../../pages/PaychecksPage';
import { paychecksPageStub } from '../../pages/paychecksPageStub';
import type { PaychecksData, PaychecksPageClient } from '../../pages/paychecks/types';
import { RoleProvider, type Role } from '../../permissions';
import { Shell } from '../Shell';
import { QuickAddProvider } from './context';
import type { QuickAddClient } from './types';

const ACCOUNTS = [{ id: 'a-checking', name: 'Everyday checking', isPrimary: true }];

const card = (over: Partial<CardRow> & { cardId: string; nickname: string }): CardRow => ({
  dueDay: 27,
  dueDate: '2026-11-27',
  usualPlan: 'full',
  archived: false,
  statement: null,
  previousCents: null,
  carriedCents: 0,
  ...over,
});

const bills = (over: Partial<BillsData> = {}): BillsData => ({
  today: '2026-11-18',
  ym: '2026-11',
  status: 'open',
  canOpen: false,
  bills: [],
  categories: [{ id: 'c-home', name: 'Home', colorIndex: 2 }],
  paychecks: [],
  otherIncome: [],
  cards: [card({ cardId: 'gas', nickname: 'Gas card' })],
  ...over,
});

const pay = (ym: string, day: string, receivedCents: number | null = null) => ({
  id: `p-${ym}-${day}`,
  scheduleId: 's1',
  scheduleName: 'Main job',
  accountName: 'Everyday checking',
  expectedDate: `${ym}-${day}`,
  expectedCents: 322_500,
  receivedDate: receivedCents === null ? null : `${ym}-${day}`,
  receivedCents,
});

const paychecksData = (ym: string): PaychecksData => ({
  today: '2026-11-18',
  ym,
  status: ym === '2026-12' ? 'not-started' : 'open',
  paychecks:
    ym === '2026-11'
      ? [pay(ym, '06', 327_218), pay(ym, '20')]
      : ym === '2026-10'
        ? [pay(ym, '23')]
        : [{ ...pay(ym, '04'), id: null }],
  schedules: [],
  accounts: ACCOUNTS,
});

/** A fake API that records every change. */
function fakeClient(options: { fail?: boolean; bills?: Partial<BillsData> } = {}) {
  const calls = {
    addBill: vi.fn(),
    removeBill: vi.fn(),
    addIncome: vi.fn(),
    removeIncome: vi.fn(),
    received: vi.fn(),
    unreceived: vi.fn(),
    statement: vi.fn(),
    billsQuery: vi.fn(),
  };
  const record =
    (spy: (input: unknown) => void, result: unknown = {}) =>
    (input: unknown) => {
      spy(input);
      return options.fail === true ? Promise.reject(new Error('boom')) : Promise.resolve(result);
    };
  const client: QuickAddClient & PaychecksPageClient = {
    ...billsPageStub,
    ...paychecksPageStub,
    ...otherIncomeStub,
    billsPage: {
      query: (input) => {
        calls.billsQuery(input);
        return Promise.resolve(bills(options.bills));
      },
    },
    addBill: { mutate: record(calls.addBill, { id: 'new-bill' }) },
    removeBill: { mutate: record(calls.removeBill) },
    paychecksPage: { query: (input) => Promise.resolve(paychecksData(input.ym ?? '2026-11')) },
    otherIncome: {
      query: () =>
        Promise.resolve({
          today: '2026-11-18',
          ym: '2026-11',
          entries: [],
          recent: [],
          accounts: ACCOUNTS,
        }),
    },
    addOtherIncome: { mutate: record(calls.addIncome, { id: 'new-income' }) },
    removeOtherIncome: { mutate: record(calls.removeIncome) },
    markPaycheckReceived: { mutate: record(calls.received) },
    unmarkPaycheckReceived: { mutate: record(calls.unreceived) },
    saveCardStatement: { mutate: record(calls.statement) },
  };
  return { client, calls };
}

function renderShell(client: QuickAddClient, role: Role = 'owner') {
  const onView = vi.fn();
  const user = userEvent.setup();
  render(
    <QuickAddProvider client={client} onView={onView}>
      <RoleProvider role={role}>
        <Shell route="dashboard" onNavigate={() => {}}>
          <p>page body</p>
        </Shell>
      </RoleProvider>
    </QuickAddProvider>,
  );
  return { user, onView };
}

const dialog = () => screen.getByRole('dialog', { name: 'Add' });
const typeButton = (name: RegExp) =>
  within(screen.getByRole('group', { name: 'What are you adding?' })).getByRole('button', { name });
const loaded = () =>
  waitFor(() => expect(within(dialog()).queryByText('Loading…')).not.toBeInTheDocument());

async function openAdd(client: QuickAddClient, type?: RegExp) {
  const opened = renderShell(client);
  await opened.user.click(screen.getByRole('button', { name: '+ Add' }));
  await loaded();
  if (type) {
    await opened.user.click(typeButton(type));
    await loaded();
  }
  return opened;
}

/** Fills the page's or Quick Add's form the same way. */
const fill = {
  bill: async (user: UserEvent, form: HTMLElement) => {
    const f = within(form);
    await user.type(f.getByLabelText('Bill name'), 'Dishwasher repair');
    await user.type(f.getByLabelText('Amount'), '189');
    await user.clear(f.getByLabelText('Due date'));
    await user.type(f.getByLabelText('Due date'), '2026-11-23');
    await user.selectOptions(f.getByLabelText('Category'), 'c-home');
    await user.click(f.getByRole('button', { name: 'Add bill' }));
  },
  income: async (user: UserEvent, form: HTMLElement) => {
    const f = within(form);
    await user.type(f.getByLabelText('Source'), 'Marketplace sale');
    await user.type(f.getByLabelText('Amount'), '120');
    await user.selectOptions(f.getByLabelText('Type'), 'sale');
    await user.type(f.getByLabelText('Note (optional)'), 'Old bike');
    await user.click(f.getByRole('button', { name: 'Add income' }));
  },
  paycheck: async (user: UserEvent, form: HTMLElement) => {
    const f = within(form);
    await user.clear(f.getByLabelText('Amount received'));
    await user.type(f.getByLabelText('Amount received'), '3248.60');
    await user.click(f.getByRole('button', { name: 'Confirm received' }));
  },
  card: async (user: UserEvent, form: HTMLElement) => {
    const f = within(form);
    await user.type(f.getByLabelText('Statement balance'), '142.36');
    await user.type(f.getByLabelText('Minimum payment'), '25');
    await user.click(f.getByRole('button', { name: 'Save balance' }));
  },
};

const billForm = () => screen.getByRole('form', { name: 'Add one-time bill' });
const incomeForm = () => screen.getByRole('form', { name: 'Add one-time income' });
const receivedForm = () => screen.getByRole('form', { name: 'Mark received' });
const cardForm = () => screen.getByRole('form', { name: 'Enter Gas card balance' });
const pickNov20 = async (user: UserEvent) =>
  user.selectOptions(within(dialog()).getByLabelText('Paycheck'), 'p-2026-11-20');

afterEach(() => vi.unstubAllGlobals());

describe('P2-10 opening Quick Add', () => {
  it('opens a modal from "+ Add" with the four types, on Bill', async () => {
    await openAdd(fakeClient().client);

    expect(dialog()).toHaveAttribute('aria-modal', 'true');
    const group = screen.getByRole('group', { name: 'What are you adding?' });
    expect(within(group).getAllByRole('button')).toHaveLength(4);
    expect(typeButton(/^Bill/)).toHaveAttribute('aria-pressed', 'true');
    expect(typeButton(/^Bill/)).toHaveFocus();
    expect(screen.getByRole('heading', { name: 'Add a bill' })).toBeInTheDocument();
  });

  it('closes with ×, Escape or Cancel, and returns to the button', async () => {
    const { user } = await openAdd(fakeClient().client);
    const addButton = screen.getByRole('button', { name: '+ Add' });

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(addButton).toHaveFocus();

    await user.click(addButton);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(addButton);
    await loaded();
    await user.click(within(billForm()).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the keyboard inside the modal', async () => {
    const { user } = await openAdd(fakeClient().client);
    const close = screen.getByRole('button', { name: 'Close' });

    close.focus();
    await user.tab({ shift: true });
    expect(dialog()).toContainElement(document.activeElement as HTMLElement);
    expect(close).not.toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
  });

  it('opens from the phone’s Add tab', async () => {
    vi.stubGlobal('matchMedia', (media: string) => ({
      matches: true,
      media,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    const { user } = renderShell(fakeClient().client);

    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(dialog()).toBeInTheDocument();
  });

  it('T21: a view-only member has no way to open it', () => {
    renderShell(fakeClient().client, 'view');

    expect(screen.queryByRole('button', { name: '+ Add' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('says when a type’s lists cannot load', async () => {
    const { client } = fakeClient();
    await openAdd({
      ...client,
      billsPage: { query: () => Promise.reject(new Error('boom')) },
    });

    expect(within(dialog()).getByRole('alert')).toHaveTextContent('Something went wrong');
  });
});

describe('P2-10 Each Quick Add type saves exactly the same record as its page form', () => {
  /** What the page form sends. */
  async function fromPage(
    render_: (client: QuickAddClient & PaychecksPageClient) => React.ReactNode,
    act_: (user: UserEvent) => Promise<void>,
    spy: keyof ReturnType<typeof fakeClient>['calls'],
  ) {
    const { client, calls } = fakeClient();
    const user = userEvent.setup();
    const view = render(<RoleProvider role="owner">{render_(client)}</RoleProvider>);
    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument());
    await act_(user);
    view.unmount();
    expect(calls[spy]).toHaveBeenCalledOnce();
    return calls[spy].mock.calls[0]?.[0] as unknown;
  }

  const billsPage = (client: QuickAddClient & PaychecksPageClient) => (
    <BillsPage client={{ ...billsPageStub, ...client }} />
  );
  const paychecksPage = (client: PaychecksPageClient) => <PaychecksPage client={client} />;

  it('bill', async () => {
    const page = await fromPage(
      billsPage,
      async (user) => {
        await user.click(screen.getByRole('button', { name: 'Add one-time bill' }));
        await fill.bill(user, billForm());
      },
      'addBill',
    );
    const { client, calls } = fakeClient();
    const { user } = await openAdd(client);

    await fill.bill(user, billForm());

    expect(calls.addBill).toHaveBeenCalledWith(page);
  });

  it('other income', async () => {
    const page = await fromPage(
      paychecksPage,
      (user) => fill.income(user, incomeForm()),
      'addIncome',
    );
    const { client, calls } = fakeClient();
    const { user } = await openAdd(client, /^Other income/);

    await fill.income(user, incomeForm());

    expect(calls.addIncome).toHaveBeenCalledWith(page);
  });

  it('paycheck received', async () => {
    const page = await fromPage(
      paychecksPage,
      async (user) => {
        await user.click(screen.getByRole('button', { name: 'Mark Nov 20 Main job received' }));
        await fill.paycheck(user, receivedForm());
      },
      'received',
    );
    const { client, calls } = fakeClient();
    const { user } = await openAdd(client, /^Paycheck received/);
    await pickNov20(user);

    await fill.paycheck(user, receivedForm());

    expect(calls.received).toHaveBeenCalledWith(page);
  });

  it('card balance', async () => {
    const page = await fromPage(
      billsPage,
      async (user) => {
        await user.click(screen.getByRole('button', { name: 'Enter Gas card balance' }));
        await fill.card(user, cardForm());
      },
      'statement',
    );
    const { client, calls } = fakeClient();
    const { user } = await openAdd(client, /^Card balance/);

    await fill.card(user, cardForm());

    expect(calls.statement).toHaveBeenCalledWith(page);
  });
});

describe('P2-10 Confirmation names the right week and month and uses role="status"', () => {
  const status = () => within(dialog()).findByRole('status');

  it('for a bill, which then waits for another', async () => {
    const { user } = await openAdd(fakeClient().client);

    await fill.bill(user, billForm());

    expect(await status()).toHaveTextContent(
      'Saved Dishwasher repair to Bills & cash flow, week 4 of November 2026.',
    );
    await waitFor(() => expect(within(billForm()).getByLabelText('Bill name')).toHaveValue(''));
  });

  it('for other income', async () => {
    const { user } = await openAdd(fakeClient().client, /^Other income/);

    await fill.income(user, incomeForm());

    expect(await status()).toHaveTextContent(
      'Saved Marketplace sale to Paychecks & income, week 3 of November 2026.',
    );
  });

  it('for a paycheck, by its expected date', async () => {
    const { user } = await openAdd(fakeClient().client, /^Paycheck received/);
    await pickNov20(user);

    await fill.paycheck(user, receivedForm());

    expect(await status()).toHaveTextContent(
      'Saved Main job paycheck to Paychecks & income, week 3 of November 2026.',
    );
  });

  it('for a card balance, by its due date', async () => {
    const { user } = await openAdd(fakeClient().client, /^Card balance/);

    await fill.card(user, cardForm());

    expect(await status()).toHaveTextContent(
      'Saved Gas card balance to Bills & cash flow, week 4 of November 2026.',
    );
  });

  it('says nothing was saved when saving fails', async () => {
    const { user } = await openAdd(fakeClient({ fail: true }).client);

    await fill.bill(user, billForm());

    expect(await within(billForm()).findByRole('alert')).toBeInTheDocument();
    expect(within(dialog()).queryByRole('status')).not.toBeInTheDocument();
    expect(within(billForm()).getByLabelText('Bill name')).toHaveValue('Dishwasher repair');
  });
});

describe('P2-10 the forms in Quick Add', () => {
  it('says where an entry will go while it is typed', async () => {
    const { user } = await openAdd(fakeClient().client);

    await user.selectOptions(within(billForm()).getByLabelText('Category'), 'c-home');

    expect(dialog()).toHaveTextContent('Goes to Bills & cash flow · Week 3 (Wed, Nov 18) · Home');
  });

  it('offers a recurring bill instead', async () => {
    const { user, onView } = await openAdd(fakeClient().client);

    await user.click(screen.getByRole('link', { name: 'Add it as a recurring bill' }));

    expect(onView).toHaveBeenCalledWith('recurring', undefined);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('lists the unmarked paychecks of open months around today', async () => {
    await openAdd(fakeClient().client, /^Paycheck received/);
    const options = within(within(dialog()).getByLabelText('Paycheck')).getAllByRole('option');

    expect(options.map((o) => o.textContent)).toEqual([
      'Fri, Oct 23 · Main job · $3,225.00',
      'Fri, Nov 20 · Main job · $3,225.00',
    ]);
  });

  it('says when no paycheck is waiting', async () => {
    const { client } = fakeClient();
    await openAdd(
      {
        ...client,
        paychecksPage: {
          query: () => Promise.resolve({ ...paychecksData('2026-11'), paychecks: [] }),
        },
      },
      /^Paycheck received/,
    );

    expect(dialog()).toHaveTextContent('No paycheck is waiting to be marked');
  });

  it('says when there is no card yet', async () => {
    const { user, onView } = await openAdd(
      fakeClient({ bills: { cards: [] } }).client,
      /^Card balance/,
    );

    expect(dialog()).toHaveTextContent('No credit cards yet');
    await user.click(screen.getByRole('link', { name: 'Add one on Bills & cash flow' }));
    expect(onView).toHaveBeenCalledWith('bills', undefined);
  });

  it('says when this month is closed to card balances', async () => {
    await openAdd(fakeClient({ bills: { status: 'closed' } }).client, /^Card balance/);

    expect(dialog()).toHaveTextContent('November is closed');
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
  });

  it('switches to another card', async () => {
    const { user } = await openAdd(
      fakeClient({
        bills: {
          cards: [
            card({ cardId: 'gas', nickname: 'Gas card' }),
            card({ cardId: 'travel', nickname: 'Travel card' }),
          ],
        },
      }).client,
      /^Card balance/,
    );

    await user.selectOptions(within(cardForm()).getByLabelText('Card'), 'travel');

    expect(screen.getByRole('form', { name: 'Enter Travel card balance' })).toBeInTheDocument();
  });
});

describe('P2-10 "Just added"', () => {
  const row = (name: string) => screen.getByRole('listitem', { name });

  it('lists each entry with its amount and where it went, and shows it', async () => {
    const { user, onView } = await openAdd(fakeClient().client);
    await fill.bill(user, billForm());

    await waitFor(() => expect(row('Dishwasher repair')).toBeInTheDocument());
    expect(row('Dishwasher repair')).toHaveTextContent('$189.00');
    expect(row('Dishwasher repair')).toHaveTextContent('Bills & cash flow · Mon, Nov 23');
    await user.click(within(row('Dishwasher repair')).getByRole('button', { name: /View/ }));

    expect(onView).toHaveBeenCalledWith('bills', '2026-11');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each([
    ['bill', /^Bill/, billForm, 'Dishwasher repair', 'removeBill', { id: 'new-bill' }],
    [
      'income',
      /^Other income/,
      incomeForm,
      'Marketplace sale',
      'removeIncome',
      { id: 'new-income' },
    ],
    [
      'paycheck',
      /^Paycheck received/,
      receivedForm,
      'Main job paycheck',
      'unreceived',
      { id: 'p-2026-10-23' },
    ],
  ] as const)('undoes a %s', async (type, button, form, name, spy, input) => {
    const { client, calls } = fakeClient();
    const { user } = await openAdd(client, button);
    await fill[type](user, form());
    await waitFor(() => expect(row(name)).toBeInTheDocument());

    await user.click(within(row(name)).getByRole('button', { name: /Undo/ }));

    expect(calls[spy]).toHaveBeenCalledWith(input);
    await waitFor(() => expect(screen.queryByRole('listitem', { name })).not.toBeInTheDocument());
    expect(within(dialog()).getByRole('status')).toHaveTextContent(`Removed ${name}.`);
  });

  it('has no Undo for a card balance', async () => {
    const { user } = await openAdd(fakeClient().client, /^Card balance/);
    await fill.card(user, cardForm());
    await waitFor(() => expect(row('Gas card balance')).toBeInTheDocument());

    expect(
      within(row('Gas card balance')).queryByRole('button', { name: /Undo/ }),
    ).not.toBeInTheDocument();
  });

  it('keeps the entry when undoing fails', async () => {
    const { client } = fakeClient();
    const { user } = await openAdd({
      ...client,
      removeBill: { mutate: () => Promise.reject(new Error('boom')) },
    });
    await fill.bill(user, billForm());
    await waitFor(() => expect(row('Dishwasher repair')).toBeInTheDocument());

    await user.click(within(row('Dishwasher repair')).getByRole('button', { name: /Undo/ }));

    expect(await within(dialog()).findByRole('alert')).toBeInTheDocument();
    expect(row('Dishwasher repair')).toBeInTheDocument();
  });
});

describe('P2-10 the page underneath', () => {
  it('shows what Quick Add saved', async () => {
    const { client, calls } = fakeClient();
    const user = userEvent.setup();
    render(
      <QuickAddProvider client={client} onView={() => {}}>
        <RoleProvider role="owner">
          <Shell route="bills" onNavigate={() => {}}>
            <BillsPage client={{ ...billsPageStub, ...client }} />
          </Shell>
        </RoleProvider>
      </QuickAddProvider>,
    );
    await screen.findByRole('heading', { level: 1, name: 'November 2026' });
    await user.click(screen.getByRole('button', { name: '+ Add' }));
    await loaded();
    calls.billsQuery.mockClear();

    await fill.bill(user, billForm());

    // Once for the page underneath and once for the form's own lists.
    await waitFor(() => expect(calls.billsQuery.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it('opens a page at the month asked for', async () => {
    const { client, calls } = fakeClient();
    render(<BillsPage client={{ ...billsPageStub, ...client }} initialYm="2026-12" />);

    await waitFor(() => expect(calls.billsQuery).toHaveBeenCalledWith({ ym: '2026-12' }));
  });
});
