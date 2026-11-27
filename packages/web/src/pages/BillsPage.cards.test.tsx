import type { CardRow } from '@withinmeans/domain';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RoleProvider, type Role } from '../permissions';
import { BillsPage } from './BillsPage';
import { billsPageStub } from './billsPageStub';
import type { BillsData, BillsPageClient } from './bills/types';

const row = (over: Partial<CardRow> & { cardId: string; nickname: string }): CardRow => ({
  dueDay: 22,
  dueDate: '2026-11-22',
  usualPlan: 'full',
  archived: false,
  statement: null,
  previousCents: null,
  carriedCents: 0,
  ...over,
});

const amounts = (statementCents: number, plannedPaymentCents = statementCents) => ({
  statementCents,
  minimumCents: 2_500,
  plannedPaymentCents,
  paidCents: null,
});

const CARDS: CardRow[] = [
  row({
    cardId: 'cash',
    nickname: 'Cash-back card',
    statement: amounts(128_417),
    previousCents: 110_255,
  }),
  row({
    cardId: 'store',
    nickname: 'Store card',
    usualPlan: 'min',
    statement: amounts(38_743, 20_000),
  }),
  row({
    cardId: 'gas',
    nickname: 'Gas card',
    dueDay: 27,
    dueDate: '2026-11-27',
    usualPlan: 'varies',
    previousCents: 9_820,
    carriedCents: 18_743,
  }),
];

const november = (over: Partial<BillsData> = {}): BillsData => ({
  today: '2026-11-18',
  ym: '2026-11',
  status: 'open',
  canOpen: false,
  bills: [],
  categories: [],
  paychecks: [],
  otherIncome: [],
  cards: CARDS,
  ...over,
});

function fakeClient(options: { data?: BillsData; fail?: boolean } = {}) {
  let data = options.data ?? november();
  const calls = { addCard: vi.fn(), save: vi.fn(), paid: vi.fn(), unpaid: vi.fn() };
  const done = () =>
    options.fail === true ? Promise.reject(new Error('boom')) : Promise.resolve({});
  const change = (cardId: string, over: (r: CardRow) => Partial<CardRow>) => {
    data = {
      ...data,
      cards: data.cards.map((c) => (c.cardId === cardId ? { ...c, ...over(c) } : c)),
    };
  };
  const client: BillsPageClient = {
    ...billsPageStub,
    billsPage: { query: () => Promise.resolve(data) },
    addCreditCard: {
      mutate: async (input) => {
        calls.addCard(input);
        await done();
        data = { ...data, cards: [...data.cards, row({ ...input, cardId: 'new' })] };
        return { id: 'new' };
      },
    },
    saveCardStatement: {
      mutate: async (input) => {
        calls.save(input);
        await done();
        const { cardId, alreadyPaid } = input;
        change(cardId, () => ({
          statement: {
            statementCents: input.statementCents,
            minimumCents: input.minimumCents,
            plannedPaymentCents: input.plannedPaymentCents,
            paidCents: alreadyPaid === true ? input.plannedPaymentCents : null,
          },
        }));
        return {};
      },
    },
    markCardPaid: {
      mutate: async (input) => {
        calls.paid(input);
        await done();
        change(input.cardId, (c) => ({
          statement: c.statement && { ...c.statement, paidCents: input.paidCents },
        }));
        return {};
      },
    },
    unmarkCardPaid: {
      mutate: async (input) => {
        calls.unpaid(input);
        await done();
        change(input.cardId, (c) => ({
          statement: c.statement && { ...c.statement, paidCents: null },
        }));
        return {};
      },
    },
  };
  return { client, calls };
}

async function open(client: BillsPageClient, role: Role = 'owner') {
  const user = userEvent.setup();
  render(
    <RoleProvider role={role}>
      <BillsPage client={client} />
    </RoleProvider>,
  );
  await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument());
  return user;
}

const cards = () => screen.getByRole('region', { name: 'Credit cards' });
const cardRow = (name: string) => within(cards()).getByRole('listitem', { name });
const form = () => screen.getByRole('form', { name: /balance$/ });
const field = (label: string | RegExp) => within(form()).getByLabelText(label);
const save = () => within(form()).getByRole('button', { name: 'Save balance' });
const enter = async (user: ReturnType<typeof userEvent.setup>, name: string) =>
  user.click(within(cardRow(name)).getByRole('button', { name: `Enter ${name} balance` }));

describe('P2-07 credit cards on Bills', () => {
  it('shows each card with its due date, plan and the total planned', async () => {
    await open(fakeClient().client);

    expect(cards()).toHaveTextContent('$1,484.17 total');
    expect(cardRow('Cash-back card')).toHaveTextContent('Due Nov 22 · +$181.62 vs Oct');
    expect(cardRow('Cash-back card')).toHaveTextContent('Paying in full');
    expect(cardRow('Cash-back card')).toHaveTextContent('$1,284.17');
    expect(cardRow('Store card')).toHaveTextContent('Paying $200.00 · $187.43 carries over');
    expect(cardRow('Gas card')).toHaveTextContent('No November balance yet · Due around the 27th');
  });

  it('T17: the next month’s row shows "carries $187.43"', async () => {
    await open(fakeClient().client);

    expect(cardRow('Gas card')).toHaveTextContent('carries $187.43');
    expect(cardRow('Store card')).not.toHaveTextContent('carries $');
  });

  it('counts the planned payments in the tiles and by category', async () => {
    await open(fakeClient().client);

    expect(screen.getByTestId('tile-bills')).toHaveTextContent('$1,484.17');
    expect(screen.getByTestId('tile-bills')).toHaveTextContent('$1,484.17 cards');
  });

  it('shows the cards in a month with no bills, even before any balance', async () => {
    await open(fakeClient({ data: november({ cards: [CARDS[2] as CardRow] }) }).client);

    expect(screen.getByRole('heading', { name: 'No bills in November yet' })).toBeInTheDocument();
    expect(cardRow('Gas card')).toBeInTheDocument();
  });

  it('keeps the empty preview in a month where no card has a balance', async () => {
    await open(fakeClient({ data: november({ cards: [CARDS[2] as CardRow] }) }).client);

    expect(screen.getByTestId('empty-preview')).toBeInTheDocument();
    expect(screen.queryByTestId('tile-bills')).not.toBeInTheDocument();
    expect(cards()).toBeInTheDocument();
  });

  it('shows only the main empty state in an empty month with no cards', async () => {
    await open(fakeClient({ data: november({ cards: [] }) }).client);

    expect(screen.getByTestId('empty-preview')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Credit cards' })).not.toBeInTheDocument();
  });

  it('offers to add a card when there are none', async () => {
    // A section's empty state shows on a page that otherwise has data (spec §6.14).
    const income = [{ id: 'i', type: 'sale' as const, amountCents: 100 }];
    const { client, calls } = fakeClient({ data: november({ cards: [], otherIncome: income }) });
    const user = await open(client);
    expect(cards()).toHaveTextContent('No credit cards yet');

    await user.click(within(cards()).getByRole('button', { name: 'Add a card' }));
    const add = screen.getByRole('form', { name: 'Add a card' });
    await user.type(within(add).getByLabelText('Nickname'), 'Gas card');
    await user.type(within(add).getByLabelText('Usual due day'), '27');
    await user.click(within(add).getByRole('button', { name: 'Add card' }));

    expect(calls.addCard).toHaveBeenCalledWith({
      nickname: 'Gas card',
      dueDay: 27,
      usualPlan: 'full',
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Added Gas card.');
    expect(screen.queryByRole('form', { name: 'Add a card' })).not.toBeInTheDocument();
  });
});

describe('P2-07 the card balance form', () => {
  it('opens for a card, compares with last month and totals what will count', async () => {
    const user = await open(fakeClient().client);

    await enter(user, 'Gas card');

    expect(screen.getByRole('form', { name: 'Enter Gas card balance' })).toBeInTheDocument();
    expect(field('Card')).toHaveValue('gas');
    expect(field('Other amount')).toBeChecked();
    expect(form()).toHaveTextContent('October statement: $98.20');
    await user.type(field('Statement balance'), '142.36');
    expect(form()).toHaveTextContent('up $44.16');
  });

  it.each([
    ['Cash-back card', 'Full balance'],
    ['Store card', 'Other amount'],
  ])('shows the saved choice when editing %s', async (name, choice) => {
    const user = await open(fakeClient().client);

    await user.click(within(cardRow(name)).getByRole('button', { name: `Edit ${name} balance` }));

    expect(field(choice)).toBeChecked();
    expect(field('Statement balance')).not.toHaveValue('');
  });

  it.each([
    ['full', '$142.36', 14_236],
    ['min', '$25.00', 2_500],
  ])('Planned payment defaults from the usual plan (%s)', async (plan, shown, cents) => {
    const data = november({
      cards: [row({ cardId: 'x', nickname: 'X card', usualPlan: plan as 'full' })],
    });
    const { client, calls } = fakeClient({ data });
    const user = await open(client);
    await enter(user, 'X card');

    await user.type(field('Statement balance'), '142.36');
    await user.type(field('Minimum payment'), '25');

    expect(form()).toHaveTextContent(`Counts toward November bills: ${shown}`);
    await user.click(save());
    expect(calls.save).toHaveBeenCalledWith({
      cardId: 'x',
      ym: '2026-11',
      statementCents: 14_236,
      minimumCents: 2_500,
      plannedPaymentCents: cents,
      alreadyPaid: false,
    });
  });

  it('saves another amount, already paid, and says so', async () => {
    const { client, calls } = fakeClient();
    const user = await open(client);
    await enter(user, 'Gas card');

    await user.type(field('Statement balance'), '142.36');
    await user.type(field('Minimum payment'), '25');
    await user.type(field('Amount you plan to pay'), '100');
    await user.click(field('Already paid'));
    await user.click(save());

    expect(calls.save).toHaveBeenCalledWith(
      expect.objectContaining({ plannedPaymentCents: 10_000, alreadyPaid: true }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Saved the Gas card balance.');
    expect(screen.queryByRole('form', { name: /balance$/ })).not.toBeInTheDocument();
    expect(cardRow('Gas card')).toHaveTextContent('Paid $100.00');
  });

  it('Planned payment > statement is rejected; minimum > statement is rejected', async () => {
    const { client, calls } = fakeClient();
    const user = await open(client);
    await enter(user, 'Gas card');
    await user.type(field('Statement balance'), '100');
    await user.type(field('Minimum payment'), '101');
    await user.type(field('Amount you plan to pay'), '50');

    await user.click(save());
    expect(within(form()).getByRole('alert')).toHaveTextContent(
      'The minimum can’t be more than the statement balance.',
    );

    await user.clear(field('Minimum payment'));
    await user.type(field('Minimum payment'), '25');
    await user.clear(field('Amount you plan to pay'));
    await user.type(field('Amount you plan to pay'), '101');
    await user.click(save());
    expect(within(form()).getByRole('alert')).toHaveTextContent(
      'The planned payment can’t be more than the statement balance.',
    );
    expect(calls.save).not.toHaveBeenCalled();
  });

  it('opens from the header for the first card without a balance, and cancels', async () => {
    const user = await open(fakeClient().client);

    await user.click(screen.getByRole('button', { name: 'Add card balance' }));

    expect(field('Card')).toHaveValue('gas');
    await user.selectOptions(field('Card'), 'cash');
    expect(screen.getByRole('form', { name: 'Enter Cash-back card balance' })).toBeInTheDocument();
    expect(field('Statement balance')).toHaveValue('1284.17');
    await user.click(within(form()).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('form', { name: /balance$/ })).not.toBeInTheDocument();
  });

  it.each(['Statement balance', 'Minimum payment', 'Amount you plan to pay'])(
    'survives a card number pasted into %s',
    async (label) => {
      const { client, calls } = fakeClient();
      const user = await open(client);
      await enter(user, 'Gas card');

      await user.click(field(label));
      await user.paste('4111111111111111');
      if (label === 'Minimum payment') await user.click(field('Minimum'));
      await user.click(save());

      expect(within(form()).getByRole('alert')).toBeInTheDocument();
      expect(form()).toHaveTextContent('Counts toward November bills: $0.00');
      expect(calls.save).not.toHaveBeenCalled();
    },
  );

  it('stays open with the problem when saving fails', async () => {
    const user = await open(fakeClient({ fail: true }).client);
    await enter(user, 'Gas card');
    await user.type(field('Statement balance'), '100');
    await user.type(field('Minimum payment'), '25');
    await user.type(field('Amount you plan to pay'), '50');

    await user.click(save());

    expect(await within(form()).findByRole('alert')).toBeInTheDocument();
    expect(field('Statement balance')).toHaveValue('100');
  });
});

describe('P2-07 paying a card', () => {
  it('marks a card paid with the amount paid, and undoes it', async () => {
    const { client, calls } = fakeClient();
    const user = await open(client);

    await user.click(
      within(cardRow('Store card')).getByRole('button', { name: 'Mark Store card paid' }),
    );
    const amount = within(cardRow('Store card')).getByLabelText('Amount paid');
    expect(amount).toHaveValue('200.00');
    await user.clear(amount);
    await user.type(amount, '250');
    await user.click(screen.getByRole('button', { name: 'Confirm paid' }));

    expect(calls.paid).toHaveBeenCalledWith({ cardId: 'store', ym: '2026-11', paidCents: 25_000 });
    expect(await screen.findByRole('status')).toHaveTextContent('Marked Store card paid.');
    expect(cardRow('Store card')).toHaveTextContent('Paid $250.00');
    expect(screen.getByTestId('tile-paid')).toHaveTextContent('$250.00');

    await user.click(screen.getByRole('button', { name: 'Undo Store card payment' }));
    expect(calls.unpaid).toHaveBeenCalledWith({ cardId: 'store', ym: '2026-11' });
  });

  it('checks the amount and can be cancelled', async () => {
    const { client, calls } = fakeClient();
    const user = await open(client);
    await user.click(screen.getByRole('button', { name: 'Mark Store card paid' }));
    await user.clear(screen.getByLabelText('Amount paid'));

    await user.click(screen.getByRole('button', { name: 'Confirm paid' }));

    expect(within(cards()).getByRole('alert')).toHaveTextContent('Enter the amount paid.');
    expect(calls.paid).not.toHaveBeenCalled();
    await user.click(within(cards()).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('Amount paid')).not.toBeInTheDocument();
  });

  it('says when paying fails', async () => {
    const user = await open(fakeClient({ fail: true }).client);
    await user.click(screen.getByRole('button', { name: 'Mark Store card paid' }));

    await user.click(screen.getByRole('button', { name: 'Confirm paid' }));

    expect(await within(cards()).findByRole('alert')).toBeInTheDocument();
  });

  it('locks the cards of a closed month', async () => {
    await open(fakeClient({ data: november({ status: 'closed' }) }).client);

    expect(within(cards()).queryByRole('button')).not.toBeInTheDocument();
  });

  it('T21: a view-only member sees no card controls', async () => {
    await open(fakeClient().client, 'view');

    expect(within(cards()).queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /card/i })).not.toBeInTheDocument();
  });
});
