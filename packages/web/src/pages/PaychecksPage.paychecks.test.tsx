import type { OtherIncomeItem } from '@withinmeans/domain';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RoleProvider, type Role } from '../permissions';
import { PaychecksPage } from './PaychecksPage';
import type { PageRow, PageSchedule, PaychecksPageClient } from './paychecks/types';

const ACCOUNTS = [
  { id: 'a-checking', name: 'Everyday checking', isPrimary: true },
  { id: 'a-savings', name: 'Savings', isPrimary: false },
];

const mainJob = (over: Partial<PageSchedule> = {}): PageSchedule => ({
  id: 's-main',
  name: 'Main job',
  frequency: 'biweekly',
  anchorDate: '2026-11-06',
  semimonthlyDays: null,
  usualCents: 322_500,
  accountId: 'a-checking',
  accountName: 'Everyday checking',
  endedOn: null,
  averageCents: 324_538,
  ...over,
});

const row = (over: Partial<PageRow> & { expectedDate: string }): PageRow => ({
  id: over.expectedDate,
  scheduleId: 's-main',
  scheduleName: 'Main job',
  accountName: 'Everyday checking',
  expectedCents: 322_500,
  receivedDate: null,
  receivedCents: null,
  ...over,
});

const NOVEMBER = (): PageRow[] => [
  row({ id: 'p1', expectedDate: '2026-11-06', receivedDate: '2026-11-06', receivedCents: 327_218 }),
  row({ id: 'p2', expectedDate: '2026-11-20' }),
];

const OTHER: (OtherIncomeItem & { accountName: string | null })[] = [
  ['i1', '2026-11-15', 'Insurance refund', 6_420] as const,
  ['i2', '2026-11-12', 'Marketplace sale', 12_000] as const,
  ['i3', '2026-11-03', 'Freelance web work', 35_000] as const,
].map(([id, date, source, amountCents]) => ({
  id,
  date,
  source,
  type: 'other',
  amountCents,
  accountId: 'a-checking',
  accountName: 'Everyday checking',
  note: null,
}));

interface Options {
  schedules?: PageSchedule[];
  paychecks?: PageRow[];
  other?: typeof OTHER;
  fail?: boolean;
}

/** A fake API that keeps its own rows, like the real one: October closed, December not started. */
function fakeClient(options: Options = {}) {
  let schedules = options.schedules ?? [mainJob()];
  let paychecks = options.paychecks ?? NOVEMBER();
  const other = options.other ?? OTHER;
  const calls = {
    page: vi.fn(),
    income: vi.fn(),
    add: vi.fn(),
    update: vi.fn(),
    stop: vi.fn(),
    restart: vi.fn(),
    mark: vi.fn(),
    unmark: vi.fn(),
  };
  const done = () =>
    options.fail === true ? Promise.reject(new Error('boom')) : Promise.resolve({});
  const change = <T,>(spy: (input: T) => void, apply: (input: T) => void) => ({
    mutate: async (input: T) => {
      spy(input);
      await done();
      apply(input);
      return {};
    },
  });
  const setEnded = (id: string, endedOn: string | null) => {
    schedules = schedules.map((s) => (s.id === id ? { ...s, endedOn } : s));
  };
  const setReceived = (id: string, receivedCents: number | null, receivedDate: string | null) => {
    paychecks = paychecks.map((p) => (p.id === id ? { ...p, receivedCents, receivedDate } : p));
  };
  const monthRows = (ym: string): PageRow[] => {
    if (ym === '2026-11') return paychecks;
    if (ym === '2026-10') {
      const paid = { receivedDate: '2026-10-09', receivedCents: 322_500 };
      return [row({ id: 'o1', expectedDate: '2026-10-09', ...paid })];
    }
    if (ym === '2026-12') {
      return [
        row({ id: null, expectedDate: '2026-12-04' }),
        row({ id: null, expectedDate: '2026-12-18' }),
      ];
    }
    return [];
  };
  const STATUS = { '2026-10': 'closed', '2026-11': 'open' } as const;

  const client: PaychecksPageClient = {
    paychecksPage: {
      query: ({ ym = '2026-11' }) => {
        calls.page(ym);
        return Promise.resolve({
          today: '2026-11-18',
          ym,
          status: STATUS[ym as keyof typeof STATUS] ?? 'not-started',
          paychecks: monthRows(ym),
          schedules,
          accounts: ACCOUNTS,
        });
      },
    },
    otherIncome: {
      query: ({ ym = '2026-11' }) => {
        calls.income(ym);
        return Promise.resolve({
          today: '2026-11-18',
          ym,
          entries: other.filter((e) => e.date.startsWith(ym)),
          recent: other.map(({ source, type, accountId }) => ({ source, type, accountId })),
          accounts: ACCOUNTS,
        });
      },
    },
    addOtherIncome: { mutate: done },
    removeOtherIncome: { mutate: done },
    addPaySchedule: change(calls.add, (input) => {
      schedules = [...schedules, mainJob({ id: 's-new', name: input.name, averageCents: null })];
    }),
    updatePaySchedule: change(calls.update, (input) => {
      schedules = schedules.map((s) =>
        s.id === input.id ? { ...s, name: input.name, usualCents: input.usualCents } : s,
      );
    }),
    stopPaySchedule: change(calls.stop, ({ id }) => setEnded(id, '2026-11-18')),
    restartPaySchedule: change(calls.restart, ({ id }) => setEnded(id, null)),
    markPaycheckReceived: change(calls.mark, (input) =>
      setReceived(input.id, input.receivedCents, input.receivedDate),
    ),
    unmarkPaycheckReceived: change(calls.unmark, ({ id }) => setReceived(id, null, null)),
  };
  return { client, calls };
}

async function open(client: PaychecksPageClient, role: Role = 'owner') {
  const user = userEvent.setup();
  render(
    <RoleProvider role={role}>
      <PaychecksPage client={client} />
    </RoleProvider>,
  );
  await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument());
  return user;
}

type User = ReturnType<typeof userEvent.setup>;

const region = (name: string | RegExp) => screen.getByRole('region', { name });
const list = (month = 'November') => region(`${month} paychecks`);
const rows = (month?: string) => within(list(month)).getAllByRole('listitem');
const tile = (id: string) => screen.getByTestId(`tile-${id}`);
const button = (name: string | RegExp) => screen.getByRole('button', { name });
const form = (name: string) => screen.getByRole('form', { name });
const names = () =>
  screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent);

async function goTo(user: User, month: string, direction: 'Previous month' | 'Next month') {
  await user.click(button(direction));
  await screen.findByRole('heading', { level: 1, name: month });
}

describe('P2-09 month tiles', () => {
  it('shows received, still expected, paychecks and one-time income', async () => {
    await open(fakeClient().client);

    expect(tile('received')).toHaveTextContent('Received so far$3,806.38');
    expect(tile('received')).toHaveTextContent('Paychecks + one-time income');
    expect(tile('expected')).toHaveTextContent('Still expected$3,225.00');
    expect(tile('expected')).toHaveTextContent('1 paycheck to come');
    expect(tile('paychecks')).toHaveTextContent('Paychecks$6,497.18');
    expect(tile('paychecks')).toHaveTextContent('2 this month · actual + expected');
    expect(tile('other')).toHaveTextContent('One-time income$534.20');
    expect(tile('other')).toHaveTextContent('3 entries this month');
  });
});

describe('P2-09 month navigator', () => {
  it('shows the month open, and a later one not started with a read-only preview', async () => {
    const { client, calls } = fakeClient();
    const user = await open(client);
    expect(screen.getByRole('heading', { level: 1, name: 'November 2026' })).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();

    await goTo(user, 'December 2026', 'Next month');

    expect(calls.page).toHaveBeenLastCalledWith('2026-12');
    expect(calls.income).toHaveBeenLastCalledWith('2026-12');
    expect(screen.getByText('Not started')).toBeInTheDocument();
    expect(rows('December')).toHaveLength(2);
    expect(rows('December')[0]).toHaveTextContent('Fri, Dec 4 · Main job');
    expect(list('December')).toHaveTextContent(
      'A preview. Paychecks can be marked once December is started.',
    );
    expect(screen.queryByRole('button', { name: /^Mark / })).not.toBeInTheDocument();
  });

  it('shows a closed month with nothing to change', async () => {
    const user = await open(fakeClient().client);

    await goTo(user, 'October 2026', 'Previous month');

    expect(screen.getByText('Closed')).toBeInTheDocument();
    expect(list('October')).toHaveTextContent('October is closed, so its income can’t be changed.');
    expect(screen.queryByRole('button', { name: /^(Mark|Undo|Remove) / })).not.toBeInTheDocument();
  });

  it('says so when a month has no paychecks', async () => {
    const user = await open(fakeClient({ paychecks: [] }).client);

    expect(within(list()).getByText('No paychecks in November')).toBeInTheDocument();
    await goTo(user, 'October 2026', 'Previous month');
  });
});

describe("P2-09 this month's paydays", () => {
  it('shows a received paycheck against what was expected, and one still to come', async () => {
    await open(fakeClient().client);
    const [nov6, nov20] = rows();

    expect(nov6).toHaveTextContent('Fri, Nov 6 · Main job');
    expect(nov6).toHaveTextContent('Received Nov 6 · Everyday checking');
    expect(nov6).toHaveTextContent('$3,272.18');
    expect(nov6).toHaveTextContent('+$47.18 vs expected');
    expect(nov20).toHaveTextContent('Fri, Nov 20 · Main job');
    expect(nov20).toHaveTextContent('Expected in 2 days · $3,225.00 expected');
  });

  it('T3: marking Nov 20 received replaces the expected amount', async () => {
    const { client, calls } = fakeClient();
    const user = await open(client);

    await user.click(button('Mark Nov 20 Main job received'));
    const received = form('Mark received');
    const amount = within(received).getByLabelText('Amount received');
    expect(amount).toHaveValue('3225.00');
    expect(amount).toHaveAttribute('inputmode', 'decimal');
    expect(within(received).getByLabelText('Date received')).toHaveValue('2026-11-20');
    expect(received).toHaveTextContent('Same as expected.');
    await user.clear(amount);
    await user.type(amount, '3248.60');
    expect(received).toHaveTextContent('$23.60 more than expected.');
    await user.click(within(received).getByRole('button', { name: 'Confirm received' }));

    expect(calls.mark).toHaveBeenCalledWith({
      id: 'p2',
      receivedCents: 324_860,
      receivedDate: '2026-11-20',
    });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Marked Nov 20 received at $3,248.60.',
    );
    expect(screen.queryByRole('form', { name: 'Mark received' })).not.toBeInTheDocument();
    expect(tile('received')).toHaveTextContent('$7,054.98');
    expect(tile('expected')).toHaveTextContent('$0.00');
    expect(tile('expected')).toHaveTextContent('Nothing left to come');
    expect(tile('paychecks')).toHaveTextContent('$6,520.78');
  });

  it('asks for an amount and date, and cancelling saves nothing', async () => {
    const { client, calls } = fakeClient();
    const user = await open(client);

    await user.click(button('Mark Nov 20 Main job received'));
    await user.clear(within(form('Mark received')).getByLabelText('Amount received'));
    await user.click(button('Confirm received'));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter the amount that landed, above $0.');
    await user.click(button('Cancel'));

    expect(screen.queryByRole('form', { name: 'Mark received' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(calls.mark).not.toHaveBeenCalled();
  });

  it('keeps the form open when saving fails', async () => {
    const user = await open(fakeClient({ fail: true }).client);

    await user.click(button('Mark Nov 20 Main job received'));
    await user.click(button('Confirm received'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    expect(form('Mark received')).toBeInTheDocument();
  });

  it('undoes a received paycheck', async () => {
    const { client, calls } = fakeClient();
    const user = await open(client);

    await user.click(button('Undo Nov 6 Main job'));

    expect(calls.unmark).toHaveBeenCalledWith({ id: 'p1' });
    expect(
      await screen.findByRole('button', { name: 'Mark Nov 6 Main job received' }),
    ).toBeEnabled();
    expect(tile('received')).toHaveTextContent('$534.20');
  });

  it('gives a heads-up about the next month with 3 paydays', async () => {
    await open(fakeClient().client);

    expect(list()).toHaveTextContent(
      'Heads up: January 2027 has 3 paydays for Main job — an extra paycheck.',
    );
  });
});

describe('P2-09 paycheck schedules', () => {
  const card = (name = 'Main job') =>
    within(region('Paycheck schedules')).getByRole('article', { name });

  it('shows frequency, account, amounts and the next paydays', async () => {
    await open(fakeClient().client);

    expect(card()).toHaveTextContent('Every 2 weeks · into Everyday checking');
    expect(card()).toHaveTextContent('Expected per paycheck$3,225.00');
    expect(card()).toHaveTextContent('Average of last 6$3,245.38');
    expect(
      within(card())
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Nov 20', 'Dec 4', 'Dec 18', 'Jan 1']);
  });

  it('says when nothing has been received yet', async () => {
    await open(fakeClient({ schedules: [mainJob({ averageCents: null })] }).client);

    expect(card()).toHaveTextContent('Average of last 6Nothing received yet');
  });

  it('sets up a new paycheck', async () => {
    const { client, calls } = fakeClient();
    const user = await open(client);

    await user.click(button('Set up a paycheck'));
    const added = form('Set up a paycheck');
    await user.type(within(added).getByLabelText('Paycheck name'), 'Side job');
    await user.selectOptions(within(added).getByLabelText('How often'), 'Every week');
    await user.type(within(added).getByLabelText('A recent payday'), '2026-11-13');
    await user.type(within(added).getByLabelText('Expected take-home'), '200');
    expect(within(added).getByLabelText('Deposits into')).toHaveValue('a-checking');
    expect(added).toHaveTextContent('Upcoming paydays:Fri, Nov 20Fri, Nov 27Fri, Dec 4Fri, Dec 11');
    await user.click(within(added).getByRole('button', { name: 'Save schedule' }));

    expect(calls.add).toHaveBeenCalledWith({
      name: 'Side job',
      frequency: 'weekly',
      anchorDate: '2026-11-13',
      usualCents: 20_000,
      accountId: 'a-checking',
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Saved Side job.');
    expect(screen.queryByRole('form', { name: 'Set up a paycheck' })).not.toBeInTheDocument();
    expect(card('Side job')).toBeInTheDocument();
  });

  it('opens the same form from "+ Add", and asks for what is missing', async () => {
    const { client, calls } = fakeClient();
    const user = await open(client);

    await user.click(button('Add a paycheck schedule'));
    await user.click(button('Save schedule'));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a name for this paycheck.');
    await user.click(button('Cancel'));

    expect(screen.queryByRole('form', { name: 'Set up a paycheck' })).not.toBeInTheDocument();
    expect(calls.add).not.toHaveBeenCalled();
  });

  it('edits a schedule, starting from what it has', async () => {
    const { client, calls } = fakeClient();
    const user = await open(client);

    await user.click(button('Edit Main job'));
    const edit = form('Edit paycheck schedule');
    expect(within(edit).getByLabelText('Paycheck name')).toHaveValue('Main job');
    expect(within(edit).getByLabelText('A recent payday')).toHaveValue('2026-11-06');
    const takeHome = within(edit).getByLabelText('Expected take-home');
    expect(takeHome).toHaveValue('3225.00');
    await user.clear(takeHome);
    await user.type(takeHome, '3300');
    await user.selectOptions(within(edit).getByLabelText('Deposits into'), 'Savings');
    await user.click(within(edit).getByRole('button', { name: 'Save schedule' }));

    expect(calls.update).toHaveBeenCalledWith({
      id: 's-main',
      name: 'Main job',
      frequency: 'biweekly',
      anchorDate: '2026-11-06',
      usualCents: 330_000,
      accountId: 'a-savings',
    });
    await waitFor(() => expect(card()).toHaveTextContent('$3,300.00'));
  });

  it('edits the two days of twice-a-month pay', async () => {
    const twice = mainJob({ frequency: 'semimonthly', semimonthlyDays: [10, 25] });
    const { client, calls } = fakeClient({ schedules: [twice] });
    const user = await open(client);

    await user.click(button('Edit Main job'));
    expect(screen.getByLabelText('First pay day')).toHaveValue('10');
    expect(screen.getByLabelText('Second pay day')).toHaveValue('25');
    await user.click(button('Save schedule'));

    expect(calls.update).toHaveBeenCalledWith(
      expect.objectContaining({ semimonthlyDays: [10, 25] }),
    );
  });

  it('stops a paycheck after confirming, then restarts it', async () => {
    const { client, calls } = fakeClient();
    const user = await open(client);

    await user.click(button('Edit Main job'));
    await user.click(button('Stop this paycheck'));
    expect(calls.stop).not.toHaveBeenCalled();
    await user.click(button('Keep it'));
    await user.click(button('Stop this paycheck'));
    await user.click(button('Yes, stop it'));

    expect(calls.stop).toHaveBeenCalledWith({ id: 's-main' });
    await waitFor(() => expect(card()).toHaveTextContent('Stopped Nov 18'));
    expect(screen.queryByRole('form', { name: 'Edit paycheck schedule' })).not.toBeInTheDocument();
    expect(within(card()).queryAllByRole('listitem')).toHaveLength(0);

    await user.click(button('Restart Main job'));

    expect(calls.restart).toHaveBeenCalledWith({ id: 's-main' });
    await waitFor(() => expect(card()).not.toHaveTextContent('Stopped'));
  });

  it('reports a restart that fails', async () => {
    const schedules = [mainJob({ endedOn: '2026-11-18' })];
    const user = await open(fakeClient({ schedules, fail: true }).client);

    await user.click(button('Restart Main job'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
  });
});

describe('P2-09 empty page (spec §6.14)', () => {
  const empty = { schedules: [], paychecks: [], other: [] };

  it('offers one main button and one alternative, with a $0.00 preview', async () => {
    await open(fakeClient(empty).client);
    const start = region('No paychecks or income yet');

    expect(
      within(start)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Set up a paycheck', 'Add one-time income']);
    expect(screen.getByTestId('empty-preview')).toHaveTextContent('$0.00');
    expect(screen.queryByTestId('tile-received')).not.toBeInTheDocument();
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
  });

  it('opens the paycheck form', async () => {
    const user = await open(fakeClient(empty).client);

    await user.click(button('Set up a paycheck'));

    expect(form('Set up a paycheck')).toBeInTheDocument();
  });

  it('opens the one-time income form, ready to type', async () => {
    const user = await open(fakeClient(empty).client);

    await user.click(button('Add one-time income'));

    expect(within(form('Add one-time income')).getByLabelText('Source')).toHaveFocus();
  });
});

describe('P2-09 view-only members', () => {
  it('T21: see everything, with only the month buttons', async () => {
    await open(fakeClient().client, 'view');

    expect(rows()).toHaveLength(2);
    expect(region('Paycheck schedules')).toHaveTextContent('Main job');
    expect(names()).toEqual(['Previous month', 'Next month']);
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
  });

  it('T21: get no buttons on the empty page either', async () => {
    await open(fakeClient({ schedules: [], paychecks: [], other: [] }).client, 'view');

    expect(region('No paychecks or income yet')).toBeInTheDocument();
    expect(names()).toEqual(['Previous month', 'Next month']);
  });
});
