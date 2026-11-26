import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RoleProvider, type Role } from '../permissions';
import { PaychecksStep, type PayRow, type PaychecksClient } from './PaychecksStep';

const mainJob: PayRow = {
  id: 'p1',
  name: 'Main job',
  frequency: 'biweekly',
  anchorDate: '2026-11-06',
  semimonthlyDays: null,
  usualCents: 322_500,
  endedOn: null,
};

/** A fake API that remembers what was added and removed. */
function fakeClient(initial: PayRow[] = []) {
  let schedules = [...initial];
  const add = vi.fn((input: Parameters<PaychecksClient['addPaySchedule']['mutate']>[0]) => {
    const id = `new-${schedules.length}`;
    schedules.push({ semimonthlyDays: null, ...input, id, endedOn: null });
    return Promise.resolve({ id });
  });
  const remove = vi.fn(({ id }: { id: string }) => {
    schedules = schedules.filter((s) => s.id !== id);
    return Promise.resolve({});
  });
  const client: PaychecksClient = {
    setupPaychecks: { query: () => Promise.resolve({ today: '2026-11-18', schedules }) },
    addPaySchedule: { mutate: add },
    removePaySchedule: { mutate: remove },
  };
  return { client, add, remove };
}

function show(client: PaychecksClient, role: Role = 'owner') {
  render(
    <RoleProvider role={role}>
      <PaychecksStep client={client} />
    </RoleProvider>,
  );
  return userEvent.setup();
}

async function open(client: PaychecksClient) {
  const user = show(client);
  await screen.findByRole('textbox', { name: 'Paycheck name' });
  return user;
}

const field = (label: string) => screen.getByLabelText(label);
const addButton = () => screen.getByRole('button', { name: 'Add paycheck' });
const preview = () => screen.getByTestId('pay-preview');
const saved = () => screen.getByRole('list', { name: 'Paychecks' });

async function fill(
  user: ReturnType<typeof userEvent.setup>,
  { name = 'Main job', payday = '2026-11-06', takeHome = '3225' } = {},
) {
  if (name !== '') await user.type(field('Paycheck name'), name);
  if (payday !== '') await user.type(field('A recent payday'), payday);
  if (takeHome !== '') await user.type(field('Usual take-home'), takeHome);
}

describe('P2-09 setup step 3: paychecks', () => {
  it('P2-09: setup step 3 shows the next 3 paydays from the domain function', async () => {
    await open(fakeClient([mainJob]).client);

    expect(saved()).toHaveTextContent('Next paydays: Nov 20, Dec 4, Dec 18');
  });

  it('shows each paycheck with its monthly estimate and the 3-paydays note', async () => {
    await open(fakeClient([mainJob]).client);

    expect(saved()).toHaveTextContent('Main job');
    expect(saved()).toHaveTextContent('Every 2 weeks · $3,225.00');
    expect(saved()).toHaveTextContent('About $6,450.00 a month');
    expect(saved()).toHaveTextContent('2 months a year have 3 paydays');
    expect(screen.getByTestId('pay-total')).toHaveTextContent('$6,450.00');
  });

  it('the 3-paydays note is only for pay every 2 weeks', async () => {
    await open(fakeClient([{ ...mainJob, frequency: 'monthly' }]).client);

    expect(saved()).toHaveTextContent('Once a month');
    expect(saved()).not.toHaveTextContent('3 paydays');
  });

  it('leaves stopped paychecks out', async () => {
    await open(fakeClient([{ ...mainJob, endedOn: '2026-11-01' }]).client);

    expect(screen.queryByRole('list', { name: 'Paychecks' })).not.toBeInTheDocument();
    expect(screen.getByText(/No paychecks yet/)).toBeInTheDocument();
  });

  it('previews the estimate and next paydays while typing', async () => {
    const user = await open(fakeClient().client);
    expect(preview()).toHaveTextContent('Enter the usual take-home to see a monthly estimate');

    await user.type(field('Usual take-home'), '3225');
    expect(preview()).toHaveTextContent('About $6,450.00 a month');
    expect(preview()).toHaveTextContent('2 months a year have 3 paydays');
    expect(preview()).not.toHaveTextContent('Next paydays');

    await user.type(field('A recent payday'), '2026-11-06');
    expect(preview()).toHaveTextContent('Next paydays: Nov 20, Dec 4, Dec 18');
  });

  it('adds a paycheck, shows it and clears the form', async () => {
    const { client, add } = fakeClient();
    const user = await open(client);
    await fill(user, { name: '  Main job ' });

    await user.click(addButton());

    expect(add).toHaveBeenCalledWith({
      name: 'Main job',
      frequency: 'biweekly',
      anchorDate: '2026-11-06',
      usualCents: 322_500,
    });
    expect(await screen.findByRole('list', { name: 'Paychecks' })).toHaveTextContent('Main job');
    expect(field('Paycheck name')).toHaveValue('');
    expect(field('Usual take-home')).toHaveValue('');
  });

  it('twice a month asks for the two days, starting at the 1st and 15th', async () => {
    const { client, add } = fakeClient();
    const user = await open(client);
    expect(screen.queryByLabelText('First pay day')).not.toBeInTheDocument();

    await user.selectOptions(field('How often'), 'Twice a month');
    expect(field('First pay day')).toHaveValue('1');
    expect(field('Second pay day')).toHaveValue('15');
    await fill(user);
    await user.clear(field('Second pay day'));
    await user.type(field('Second pay day'), '16');
    expect(preview()).toHaveTextContent('Next paydays: Dec 1, Dec 16, Jan 1');
    await user.click(addButton());

    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({ frequency: 'semimonthly', semimonthlyDays: [1, 16] }),
    );
  });

  it('shows no next paydays while the two days are not usable', async () => {
    const user = await open(fakeClient().client);
    await user.selectOptions(field('How often'), 'Twice a month');
    await fill(user);

    await user.clear(field('Second pay day'));

    expect(preview()).not.toHaveTextContent('Next paydays');
  });

  it.each([
    [{ name: '' }, 'Enter a name for this paycheck.'],
    [{ takeHome: '0' }, 'Enter a take-home above $0.'],
    [{ payday: '' }, 'Pick a recent payday.'],
  ])('P2-09: take-home must be > 0 and the date valid (%o)', async (bad, message) => {
    const { client, add } = fakeClient();
    const user = await open(client);
    await fill(user, bad);

    await user.click(addButton());

    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(add).not.toHaveBeenCalled();
  });

  it('refuses a take-home too large to add up, without breaking the screen', async () => {
    const { client, add } = fakeClient();
    const user = await open(client);
    await fill(user, { takeHome: '9999999999999999' });
    expect(preview()).toHaveTextContent('Enter the usual take-home to see a monthly estimate');

    await user.click(addButton());

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter a take-home of $100,000,000 or less.',
    );
    expect(add).not.toHaveBeenCalled();
  });

  it('removes a paycheck', async () => {
    const { client, remove } = fakeClient([mainJob]);
    const user = await open(client);

    await user.click(within(saved()).getByRole('button', { name: 'Remove Main job' }));

    expect(remove).toHaveBeenCalledWith({ id: 'p1' });
    expect(await screen.findByText(/No paychecks yet/)).toBeInTheDocument();
  });

  it("shows the API's reason when removing is refused", async () => {
    const { client } = fakeClient([mainJob]);
    client.removePaySchedule.mutate = () =>
      Promise.reject(
        Object.assign(new Error('This paycheck has history.'), {
          name: 'TRPCClientError',
          data: { code: 'BAD_REQUEST' },
        }),
      );
    const user = await open(client);

    await user.click(screen.getByRole('button', { name: 'Remove Main job' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('This paycheck has history.');
  });

  it('keeps what was typed when adding fails', async () => {
    const { client } = fakeClient();
    client.addPaySchedule.mutate = () => Promise.reject(new Error('boom'));
    const user = await open(client);
    await fill(user);

    await user.click(addButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    expect(field('Paycheck name')).toHaveValue('Main job');
  });

  it('shows an error when the paychecks cannot be loaded', async () => {
    const { client } = fakeClient();
    client.setupPaychecks.query = () => Promise.reject(new Error('boom'));
    show(client);

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
  });

  it('T21: a view-only member sees the paychecks but no way to change them', async () => {
    show(fakeClient([mainJob]).client, 'view');

    expect(await screen.findByRole('list', { name: 'Paychecks' })).toHaveTextContent('Main job');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
