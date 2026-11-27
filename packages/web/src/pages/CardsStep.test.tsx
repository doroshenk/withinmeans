import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RoleProvider, type Role } from '../permissions';
import { accountsStub } from './accountsStub';
import { CardsStep } from './CardsStep';
import type { CardsClient, CreditCardView, NewCardInput } from './cards/types';
import { cardsStub } from './cardsStub';
import { categoriesStub } from './categoriesStub';
import { paychecksStub } from './paychecksStub';
import { recurringBillsStub } from './recurringBillsStub';
import { SetupWizard, type SetupClient } from './SetupWizard';
import { welcomeStub } from './welcomeStub';

const TRAVEL: CreditCardView = { id: 'c1', nickname: 'Travel card', dueDay: 26, usualPlan: 'full' };

function fakeClient(initial: CreditCardView[] = [], fail = false) {
  let cards = initial;
  const calls = { add: vi.fn(), remove: vi.fn() };
  const done = () => (fail ? Promise.reject(new Error('boom')) : Promise.resolve({}));
  const client: CardsClient = {
    creditCards: { query: () => Promise.resolve(cards) },
    addCreditCard: {
      mutate: async (input: NewCardInput) => {
        calls.add(input);
        await done();
        cards = [...cards, { ...input, id: 'new' }];
        return { id: 'new' };
      },
    },
    removeCreditCard: {
      mutate: async (input) => {
        calls.remove(input);
        await done();
        cards = cards.filter((c) => c.id !== input.id);
        return {};
      },
    },
  };
  return { client, calls };
}

async function open(client: CardsClient, role: Role = 'owner') {
  const user = userEvent.setup();
  render(
    <RoleProvider role={role}>
      <CardsStep client={client} />
    </RoleProvider>,
  );
  await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument());
  return user;
}

const form = () => screen.getByRole('form', { name: 'Add a card' });
const field = (label: string) => within(form()).getByLabelText(label);
const add = () => within(form()).getByRole('button', { name: 'Add card' });

describe('P2-07 setup step 6: credit cards', () => {
  it('lists the cards with their due day and usual payment', async () => {
    await open(fakeClient([TRAVEL]).client);

    const item = within(screen.getByRole('list', { name: 'Credit cards' })).getByRole('listitem');
    expect(item).toHaveTextContent('Travel card');
    expect(item).toHaveTextContent('Due on the 26th');
    expect(item).toHaveTextContent('Full balance');
  });

  it('adds a card and clears the form', async () => {
    const { client, calls } = fakeClient();
    const user = await open(client);

    await user.type(field('Nickname'), 'Gas card');
    await user.type(field('Usual due day'), '27');
    await user.selectOptions(field('Usual payment'), 'varies');
    await user.click(add());

    expect(calls.add).toHaveBeenCalledWith({
      nickname: 'Gas card',
      dueDay: 27,
      usualPlan: 'varies',
    });
    expect(await screen.findByText('Gas card')).toBeInTheDocument();
    expect(field('Nickname')).toHaveValue('');
  });

  it('requires a nickname', async () => {
    const { client, calls } = fakeClient();
    const user = await open(client);

    await user.click(add());

    expect(screen.getByRole('alert')).toHaveTextContent('Give the card a nickname.');
    expect(calls.add).not.toHaveBeenCalled();
  });

  it('No card number field exists anywhere', async () => {
    await open(fakeClient().client);

    expect(screen.queryByLabelText(/number/i)).not.toBeInTheDocument();
    expect(within(form()).getAllByRole('textbox')).toHaveLength(2);
    expect(screen.getByText(/Never enter a card number/)).toBeInTheDocument();
  });

  it('removes a card', async () => {
    const { client, calls } = fakeClient([TRAVEL]);
    const user = await open(client);

    await user.click(screen.getByRole('button', { name: 'Remove Travel card' }));

    expect(calls.remove).toHaveBeenCalledWith({ id: 'c1' });
    await waitFor(() => expect(screen.queryByText('Travel card')).not.toBeInTheDocument());
  });

  it('says when a change fails', async () => {
    const user = await open(fakeClient([TRAVEL], true).client);

    await user.click(screen.getByRole('button', { name: 'Remove Travel card' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Travel card')).toBeInTheDocument();
  });

  it('keeps what was typed when adding fails', async () => {
    const user = await open(fakeClient([], true).client);
    await user.type(field('Nickname'), 'Gas card');
    await user.type(field('Usual due day'), '27');

    await user.click(add());

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(field('Nickname')).toHaveValue('Gas card');
  });

  it('does not look unsaved when only the reload fails', async () => {
    let loads = 0;
    const { client, calls } = fakeClient();
    const user = await open({
      ...client,
      creditCards: {
        query: () =>
          loads++ === 0 ? client.creditCards.query() : Promise.reject(new Error('boom')),
      },
    });
    await user.type(field('Nickname'), 'Gas card');
    await user.type(field('Usual due day'), '27');

    await user.click(add());

    expect(await screen.findByRole('alert')).toHaveTextContent('Saved');
    // The form is cleared, so a second press cannot add the card twice.
    expect(field('Nickname')).toHaveValue('');
    expect(calls.add).toHaveBeenCalledOnce();
  });

  it('says when the cards cannot load', async () => {
    await open({ ...cardsStub, creditCards: { query: () => Promise.reject(new Error('boom')) } });

    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
  });

  it('T21: a view-only member sees no way to add or remove', async () => {
    await open(fakeClient([TRAVEL]).client, 'view');

    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('says when there are no cards', async () => {
    await open(fakeClient().client, 'view');

    expect(screen.getByText(/No cards yet/)).toBeInTheDocument();
  });
});

describe('P2-07 step 6 in the wizard', () => {
  function wizard(cards: CreditCardView[]) {
    const save = vi.fn((input: { step: number; status: 'done' | 'skipped' }) =>
      Promise.resolve({ ...input }),
    );
    const client: SetupClient = {
      setupProgress: {
        query: () =>
          Promise.resolve([1, 2, 3, 4, 5].map((step) => ({ step, status: 'done' as const }))),
      },
      saveSetupStep: { mutate: save },
      ...welcomeStub,
      ...accountsStub,
      ...categoriesStub,
      ...recurringBillsStub,
      ...paychecksStub,
      ...fakeClient(cards).client,
    };
    render(
      <RoleProvider role="owner">
        <SetupWizard client={client} householdName="The Examples" onExit={() => {}} />
      </RoleProvider>,
    );
    return { user: userEvent.setup(), save };
  }

  it('shows the credit cards instead of "Coming soon"', async () => {
    wizard([]);

    expect(await screen.findByText('Step 6 of 9')).toBeInTheDocument();
    expect(await screen.findByRole('form', { name: 'Add a card' })).toBeInTheDocument();
    expect(screen.queryByText('Coming soon')).not.toBeInTheDocument();
  });

  it('is finished only with at least one card', async () => {
    const { user, save } = wizard([]);
    await screen.findByRole('form', { name: 'Add a card' });

    await user.click(screen.getByRole('button', { name: 'Save & continue' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Add a card, or skip for now.');
    expect(save).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Skip for now' }));
    expect(save).toHaveBeenCalledWith({ step: 6, status: 'skipped' });
  });

  it('Save & continue saves step 6 and moves on', async () => {
    const { user, save } = wizard([TRAVEL]);
    await screen.findByText('Travel card');

    await user.click(screen.getByRole('button', { name: 'Save & continue' }));

    expect(await screen.findByText('Step 7 of 9')).toBeInTheDocument();
    expect(save).toHaveBeenCalledWith({ step: 6, status: 'done' });
  });
});
