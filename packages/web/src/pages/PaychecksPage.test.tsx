import type { OtherIncomeItem } from '@withinmeans/domain';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RoleProvider, type Role } from '../permissions';
import { PaychecksPage, type OtherIncomeClient } from './PaychecksPage';

type Entry = OtherIncomeItem & { accountName: string | null };

const ACCOUNTS = [
  { id: 'a-checking', name: 'Everyday checking', isPrimary: true },
  { id: 'a-cash', name: 'Cash', isPrimary: false },
];

const entry = (over: Partial<Entry> & { id: string; date: string }): Entry => ({
  source: 'Freelance web work',
  type: 'side_work',
  amountCents: 35_000,
  accountId: 'a-checking',
  accountName: 'Everyday checking',
  note: null,
  ...over,
});

const NOVEMBER: Entry[] = [
  entry({
    id: 'i3',
    date: '2026-11-15',
    source: 'Insurance refund',
    type: 'refund',
    amountCents: 6_420,
  }),
  entry({
    id: 'i2',
    date: '2026-11-12',
    source: 'Marketplace sale',
    type: 'sale',
    amountCents: 12_000,
    accountId: 'a-cash',
    accountName: 'Cash',
    note: 'Old bike',
  }),
  entry({ id: 'i1', date: '2026-11-03', note: 'Site fixes' }),
];

/** A fake API that keeps its own list, like the real one, so the screen's reloads are testable. */
function fakeClient(options: { entries?: Entry[]; fail?: boolean; loadFails?: boolean } = {}) {
  let entries = options.entries ?? NOVEMBER;
  const calls = { add: vi.fn(), remove: vi.fn() };
  const done = () =>
    options.fail === true ? Promise.reject(new Error('boom')) : Promise.resolve({});
  const client: OtherIncomeClient = {
    otherIncome: {
      query: () =>
        options.loadFails === true
          ? Promise.reject(new Error('boom'))
          : Promise.resolve({
              today: '2026-11-18',
              ym: '2026-11',
              entries: entries.filter((e) => e.date.startsWith('2026-11')),
              recent: entries.map((e) => ({
                source: e.source,
                type: e.type,
                accountId: e.accountId,
              })),
              accounts: ACCOUNTS,
            }),
    },
    addOtherIncome: {
      mutate: async (input) => {
        calls.add(input);
        await done();
        entries = [
          entry({
            ...input,
            id: 'new',
            accountId: input.accountId ?? null,
            accountName: ACCOUNTS.find((a) => a.id === input.accountId)?.name ?? null,
            note: input.note ?? null,
          }),
          ...entries,
        ];
        return { id: 'new' };
      },
    },
    removeOtherIncome: {
      mutate: async (input) => {
        calls.remove(input);
        await done();
        entries = entries.filter((e) => e.id !== input.id);
        return {};
      },
    },
  };
  return { client, calls };
}

async function open(client: OtherIncomeClient, role: Role = 'owner') {
  const user = userEvent.setup();
  render(
    <RoleProvider role={role}>
      <PaychecksPage client={client} />
    </RoleProvider>,
  );
  await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument());
  return user;
}

const list = () => screen.getByRole('region', { name: 'Other income in November' });
const form = () => screen.getByRole('form', { name: 'Add one-time income' });
const field = (label: string | RegExp) => within(form()).getByLabelText(label);
const submit = () => within(form()).getByRole('button', { name: 'Add income' });

describe('P2-04 one-time income list', () => {
  it('heads the page with this month', async () => {
    await open(fakeClient().client);

    expect(screen.getByRole('heading', { level: 1, name: 'November 2026' })).toBeInTheDocument();
    expect(screen.getByText('Paychecks & other income')).toBeInTheDocument();
  });

  it("lists the month's entries with their total", async () => {
    await open(fakeClient().client);

    expect(within(list()).getByTestId('other-income-total')).toHaveTextContent('$534.20');
    const rows = within(list()).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('Insurance refund');
    expect(rows[0]).toHaveTextContent('Sun, Nov 15 · Refund · Everyday checking');
    expect(rows[0]).toHaveTextContent('+$64.20');
    expect(rows[1]).toHaveTextContent('Thu, Nov 12 · Sale · Cash · Old bike');
  });

  it('shows an empty section with $0.00 when the month has none', async () => {
    await open(fakeClient({ entries: [] }).client);

    expect(within(list()).getByText('No one-time income in November')).toBeInTheDocument();
    expect(within(list()).getByTestId('other-income-total')).toHaveTextContent('$0.00');
    expect(screen.queryByText('Recent:')).not.toBeInTheDocument();
  });

  it('says when it cannot load', async () => {
    await open(fakeClient({ loadFails: true }).client);

    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
  });

  it('removes an entry only after confirming', async () => {
    const { client, calls } = fakeClient();
    const user = await open(client);

    await user.click(within(list()).getByRole('button', { name: 'Remove Marketplace sale' }));
    expect(calls.remove).not.toHaveBeenCalled();
    await user.click(within(list()).getByRole('button', { name: 'Keep it' }));
    await user.click(within(list()).getByRole('button', { name: 'Remove Marketplace sale' }));
    await user.click(within(list()).getByRole('button', { name: 'Yes, remove' }));

    expect(calls.remove).toHaveBeenCalledWith({ id: 'i2' });
    await waitFor(() => expect(within(list()).getAllByRole('listitem')).toHaveLength(2));
    expect(within(list()).getByTestId('other-income-total')).toHaveTextContent('$414.20');
  });

  it('reports a removal that fails', async () => {
    const user = await open(fakeClient({ fail: true }).client);

    await user.click(within(list()).getByRole('button', { name: 'Remove Marketplace sale' }));
    await user.click(within(list()).getByRole('button', { name: 'Yes, remove' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    expect(within(list()).getByText('Marketplace sale')).toBeInTheDocument();
  });
});

describe('P2-04 one-time income form', () => {
  it('starts on today, Side work and primary checking', async () => {
    await open(fakeClient().client);

    expect(field('Date received')).toHaveValue('2026-11-18');
    expect(field('Type')).toHaveValue('side_work');
    expect(field('Deposited into')).toHaveValue('a-checking');
    expect(field('Amount')).toHaveAttribute('inputmode', 'decimal');
  });

  it('saves an entry, shows it and clears the source, amount and note', async () => {
    const { client, calls } = fakeClient();
    const user = await open(client);

    await user.type(field('Source'), 'Birthday');
    await user.type(field('Amount'), '25');
    await user.selectOptions(field('Type'), 'Gift');
    await user.selectOptions(field('Deposited into'), 'Cash');
    await user.type(field(/^Note/), 'From Gran');
    await user.click(submit());

    expect(calls.add).toHaveBeenCalledWith({
      source: 'Birthday',
      amountCents: 2_500,
      date: '2026-11-18',
      type: 'gift',
      accountId: 'a-cash',
      note: 'From Gran',
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Added $25.00 to November 2026.');
    expect(within(list()).getByTestId('other-income-total')).toHaveTextContent('$559.20');
    expect(field('Source')).toHaveValue('');
    expect(field('Amount')).toHaveValue('');
    expect(field(/^Note/)).toHaveValue('');
    expect(field('Type')).toHaveValue('gift');
    expect(field('Deposited into')).toHaveValue('a-cash');
  });

  it('names the month an entry landed in when it is not the one shown', async () => {
    const { client, calls } = fakeClient();
    const user = await open(client);

    await user.type(field('Source'), 'Birthday');
    await user.type(field('Amount'), '25');
    await user.clear(field('Date received'));
    await user.type(field('Date received'), '2026-10-31');
    await user.click(submit());

    expect(calls.add).toHaveBeenCalledWith(
      expect.not.objectContaining({ note: expect.anything() }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Added $25.00 to October 2026.');
    expect(within(list()).getByTestId('other-income-total')).toHaveTextContent('$534.20');
  });

  it('fills the source, type and account from a recent one', async () => {
    const user = await open(fakeClient().client);

    await user.click(within(form()).getByRole('button', { name: 'Marketplace sale' }));

    expect(field('Source')).toHaveValue('Marketplace sale');
    expect(field('Type')).toHaveValue('sale');
    expect(field('Deposited into')).toHaveValue('a-cash');
  });

  it('asks for what is missing before saving', async () => {
    const { client, calls } = fakeClient();
    const user = await open(client);

    await user.click(submit());
    expect(screen.getByRole('alert')).toHaveTextContent('Say where the money came from.');
    await user.type(field('Source'), 'Birthday');
    await user.click(submit());
    expect(screen.getByRole('alert')).toHaveTextContent('Enter an amount more than zero.');
    expect(calls.add).not.toHaveBeenCalled();
  });

  it('keeps what was typed when saving fails', async () => {
    const user = await open(fakeClient({ fail: true }).client);

    await user.type(field('Source'), 'Birthday');
    await user.type(field('Amount'), '25');
    await user.click(submit());

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    expect(field('Source')).toHaveValue('Birthday');
    expect(field('Amount')).toHaveValue('25');
  });

  it('puts the cursor in the form from the header button', async () => {
    const user = await open(fakeClient().client);

    await user.click(screen.getByRole('button', { name: 'Add one-time income' }));

    expect(field('Source')).toHaveFocus();
  });

  it('T21: a view-only member sees the list and no write controls', async () => {
    await open(fakeClient().client, 'view');

    expect(within(list()).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
