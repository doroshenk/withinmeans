import { describe, expect, it } from 'vitest';
import { billsMonthSummary } from './billsPage';
import { moneyOut } from './cashflow';
import {
  addCreditCardInput,
  cardCashflow,
  cardChangeText,
  cardDraftError,
  cardDueDate,
  cardMonthRows,
  cardPlanText,
  cardPreviousText,
  carriedCents,
  carryText,
  defaultPlanChoice,
  defaultPlannedPayment,
  markCardPaidInput,
  paidDraftError,
  parseCardAmount,
  planChoiceOf,
  plannedForChoice,
  removeCreditCardInput,
  saveCardStatementInput,
  setupCardsError,
  statementDraftError,
  statementError,
  unmarkCardPaidInput,
  USUAL_PLAN_LABELS,
  type CreditCardItem,
  type StatementItem,
} from './creditCards';

const card = (over: Partial<CreditCardItem> & { id: string }): CreditCardItem => ({
  nickname: over.id,
  dueDay: 22,
  usualPlan: 'full',
  archived: false,
  ...over,
});

const statement = (
  over: Partial<StatementItem> & { cardId: string; ym: string },
): StatementItem => ({
  statementCents: 147_160,
  minimumCents: 3_500,
  plannedPaymentCents: 147_160,
  paidCents: null,
  ...over,
});

describe('P2-07 statement rules (spec §5.10)', () => {
  const ok = { statementCents: 38_743, minimumCents: 2_500, plannedPaymentCents: 20_000 };

  it('accepts a payment and a minimum up to the statement', () => {
    expect(statementError(ok)).toBeUndefined();
    expect(
      statementError({ statementCents: 100, minimumCents: 100, plannedPaymentCents: 100 }),
    ).toBeUndefined();
    expect(
      statementError({ statementCents: 0, minimumCents: 0, plannedPaymentCents: 0 }),
    ).toBeUndefined();
  });

  it('Planned payment > statement is rejected; minimum > statement is rejected', () => {
    expect(statementError({ ...ok, plannedPaymentCents: 38_744 })).toBe(
      'The planned payment can’t be more than the statement balance.',
    );
    expect(statementError({ ...ok, minimumCents: 38_744 })).toBe(
      'The minimum can’t be more than the statement balance.',
    );
    expect(
      saveCardStatementInput.safeParse({
        cardId: '11111111-1111-4111-8111-111111111111',
        ym: '2026-11',
        ...ok,
        plannedPaymentCents: 38_744,
      }).success,
    ).toBe(false);
    expect(
      saveCardStatementInput.safeParse({
        cardId: '11111111-1111-4111-8111-111111111111',
        ym: '2026-11',
        ...ok,
        minimumCents: 38_744,
      }).success,
    ).toBe(false);
  });

  it('accepts a statement within the rules', () => {
    const input = { cardId: '11111111-1111-4111-8111-111111111111', ym: '2026-11', ...ok };

    expect(saveCardStatementInput.safeParse(input).success).toBe(true);
  });

  it.each([
    { statementCents: -1 },
    { minimumCents: -1 },
    { plannedPaymentCents: -1 },
    { statementCents: 1.5 },
    { statementCents: 10_000_000_001 },
  ])('rejects %o', (over) => {
    expect(statementError({ ...ok, ...over })).toBe('Enter amounts from $0 to $100,000,000.');
  });
});

describe('P2-07 planned payment (spec §5.10)', () => {
  it('Planned payment defaults from the usual plan (full / minimum / varies)', () => {
    expect(defaultPlannedPayment('full', 38_743, 2_500)).toBe(38_743);
    expect(defaultPlannedPayment('min', 38_743, 2_500)).toBe(2_500);
    expect(defaultPlannedPayment('varies', 38_743, 2_500)).toBeNull();
    expect(['full', 'min', 'varies'].map((p) => defaultPlanChoice(p as 'full'))).toEqual([
      'full',
      'min',
      'other',
    ]);
    expect(USUAL_PLAN_LABELS).toEqual({
      full: 'Full balance',
      min: 'Minimum',
      varies: 'Varies',
    });
  });

  it('pays what the choice says', () => {
    expect(plannedForChoice('full', 38_743, 2_500, null)).toBe(38_743);
    expect(plannedForChoice('min', 38_743, 2_500, 1)).toBe(2_500);
    expect(plannedForChoice('other', 38_743, 2_500, 20_000)).toBe(20_000);
    expect(plannedForChoice('other', 38_743, 2_500, null)).toBeNull();
  });

  it('knows which choice a saved statement made', () => {
    const base = { statementCents: 38_743, minimumCents: 2_500 };
    expect(planChoiceOf({ ...base, plannedPaymentCents: 38_743 })).toBe('full');
    expect(planChoiceOf({ ...base, plannedPaymentCents: 2_500 })).toBe('min');
    expect(planChoiceOf({ ...base, plannedPaymentCents: 20_000 })).toBe('other');
  });
});

describe('P2-07 carried amounts (spec §5.10)', () => {
  const cards = [card({ id: 'cash' })];
  const october = statement({ cardId: 'cash', ym: '2026-10', paidCents: 128_417 });

  it('T17: statement $1,471.60 paid $1,284.17 → next month’s row shows "carries $187.43"', () => {
    const [row] = cardMonthRows(cards, [october], '2026-11');

    expect(row?.carriedCents).toBe(18_743);
    expect(carryText(row?.carriedCents ?? 0)).toBe('carries $187.43');
  });

  it('carries the whole balance when nothing was paid, and nothing when it was paid off', () => {
    expect(carriedCents({ statementCents: 5_000, paidCents: null })).toBe(5_000);
    expect(carriedCents({ statementCents: 5_000, paidCents: 5_000 })).toBe(0);
    expect(carriedCents({ statementCents: 5_000, paidCents: 6_000 })).toBe(0);
    expect(carriedCents(null)).toBe(0);
    expect(carryText(0)).toBeNull();
  });

  it('carries only from the month before', () => {
    expect(cardMonthRows(cards, [october], '2026-12')[0]?.carriedCents).toBe(0);
    expect(cardMonthRows(cards, [october], '2026-10')[0]?.carriedCents).toBe(0);
  });
});

describe('P2-07 the month’s card rows', () => {
  const cards = [
    card({ id: 'travel', dueDay: 26 }),
    card({ id: 'gas', dueDay: 31, usualPlan: 'varies' }),
    card({ id: 'old', archived: true }),
    card({ id: 'closed', archived: true, dueDay: 1 }),
    card({ id: 'b', dueDay: 26 }),
  ];
  const statements = [
    statement({ cardId: 'travel', ym: '2026-11', paidCents: 100 }),
    statement({ cardId: 'travel', ym: '2026-10', statementCents: 104_010 }),
    statement({ cardId: 'closed', ym: '2026-11' }),
    statement({ cardId: 'old', ym: '2026-10' }),
  ];

  it('lists active cards and removed ones that have a statement, by due day then name', () => {
    expect(cardMonthRows(cards, statements, '2026-11').map((r) => r.cardId)).toEqual([
      'closed',
      'b',
      'travel',
      'gas',
    ]);
  });

  it('gives each row its statement, due date and the month before', () => {
    const rows = cardMonthRows(cards, statements, '2026-11');

    expect(rows.find((r) => r.cardId === 'travel')).toEqual({
      cardId: 'travel',
      nickname: 'travel',
      dueDay: 26,
      dueDate: '2026-11-26',
      usualPlan: 'full',
      archived: false,
      statement: {
        statementCents: 147_160,
        minimumCents: 3_500,
        plannedPaymentCents: 147_160,
        paidCents: 100,
      },
      previousCents: 104_010,
      carriedCents: 104_010,
    });
    expect(rows.find((r) => r.cardId === 'gas')).toMatchObject({
      dueDate: '2026-11-30',
      statement: null,
      previousCents: null,
      carriedCents: 0,
    });
  });

  it('uses the last day of a shorter month', () => {
    expect(cardDueDate('2027-02', 31)).toBe('2027-02-28');
    expect(cardDueDate('2026-12', 5)).toBe('2026-12-05');
    expect(() => cardDueDate('2026-13', 5)).toThrow(RangeError);
  });

  it('rejects a month that is not "YYYY-MM"', () => {
    expect(() => cardMonthRows([], [], 'soon')).toThrow(RangeError);
  });

  it('counts planned payments as money out and paid ones as paid so far', () => {
    const month = {
      paychecks: [],
      otherIncome: [],
      bills: [],
      cards: cardCashflow(cardMonthRows(cards, statements, '2026-11')),
    };

    expect(moneyOut(month)).toBe(294_320);
    expect(billsMonthSummary(month)).toMatchObject({
      cardsCents: 294_320,
      paidCents: 100,
      outCents: 294_320,
    });
    expect(month.cards.find((c) => c.cardId === 'gas')).toEqual({
      cardId: 'gas',
      name: 'gas',
      plannedPaymentCents: null,
      paidCents: null,
    });
  });

  it('never shows more than 100% paid', () => {
    const summary = billsMonthSummary({
      paychecks: [],
      otherIncome: [],
      bills: [],
      cards: [{ cardId: 'a', name: 'a', plannedPaymentCents: 100, paidCents: 500 }],
    });

    expect(summary.paidPct).toBe(100);
  });
});

describe('P2-07 row texts (design/Bills.png)', () => {
  const base = { statementCents: 38_743, minimumCents: 2_500, paidCents: null };

  it('says how the statement is being paid', () => {
    expect(cardPlanText({ ...base, plannedPaymentCents: 38_743 })).toBe('Paying in full');
    expect(cardPlanText({ ...base, plannedPaymentCents: 20_000 })).toBe(
      'Paying $200.00 · $187.43 carries over',
    );
    expect(cardPlanText({ ...base, plannedPaymentCents: 38_743, paidCents: 38_743 })).toBe(
      'Paid $387.43',
    );
    expect(cardPlanText({ ...base, statementCents: 0, plannedPaymentCents: 0 })).toBe(
      'Nothing due',
    );
  });

  it('says what the last statement was, and the change once a balance is typed', () => {
    expect(cardPreviousText(9_820, null, '2026-11')).toBe('October statement: $98.20');
    expect(cardPreviousText(9_820, 14_236, '2026-11')).toBe(
      'October statement: $98.20 · up $44.16',
    );
    expect(cardPreviousText(9_820, 9_000, '2027-01')).toBe(
      'December statement: $98.20 · down $8.20',
    );
    expect(cardPreviousText(100, 100, '2026-11')).toBe('October statement: $1.00 · no change');
  });

  it('compares with the month before', () => {
    expect(cardChangeText(128_417, 110_255, '2026-11')).toBe('+$181.62 vs Oct');
    expect(cardChangeText(96_840, 104_010, '2026-11')).toBe('−$71.70 vs Oct');
    expect(cardChangeText(100, 100, '2027-01')).toBe('Same as Dec');
  });
});

describe('P2-07 the forms', () => {
  const cardDraft = { nickname: 'Travel card', dueDayText: '26' };

  it('accepts a filled card form', () => {
    expect(cardDraftError(cardDraft)).toBeUndefined();
  });

  it.each([
    [{ nickname: ' ' }, 'Give the card a nickname.'],
    [{ nickname: 'x'.repeat(41) }, 'Keep the nickname to 40 characters.'],
    [{ nickname: '4111 1111 1111 1111' }, 'Use a nickname, not the card number.'],
    [{ nickname: 'Visa 1234-5678' }, 'Use a nickname, not the card number.'],
    [{ dueDayText: '' }, 'Pick a due day from 1 to 31.'],
    [{ dueDayText: '0' }, 'Pick a due day from 1 to 31.'],
    [{ dueDayText: '32' }, 'Pick a due day from 1 to 31.'],
    [{ dueDayText: '1.5' }, 'Pick a due day from 1 to 31.'],
  ])('says what is wrong with %o', (over, message) => {
    expect(cardDraftError({ ...cardDraft, ...over })).toBe(message);
  });

  const input = { nickname: ' Gas card ', dueDay: 27, usualPlan: 'varies' as const };

  it('No card number field exists anywhere', () => {
    expect(Object.keys(addCreditCardInput.shape).sort()).toEqual([
      'dueDay',
      'nickname',
      'usualPlan',
    ]);
    expect(Object.keys(saveCardStatementInput.shape).sort()).toEqual([
      'alreadyPaid',
      'cardId',
      'minimumCents',
      'plannedPaymentCents',
      'statementCents',
      'ym',
    ]);
    expect(addCreditCardInput.safeParse({ ...input, nickname: '4111111111111111' }).success).toBe(
      false,
    );
    // A short number such as a year is still a nickname.
    expect(addCreditCardInput.safeParse({ ...input, nickname: 'Rewards 2026' }).success).toBe(true);
  });

  it('checks the card and payment calls', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(addCreditCardInput.parse(input).nickname).toBe('Gas card');
    expect(addCreditCardInput.safeParse({ ...input, dueDay: 32 }).success).toBe(false);
    expect(addCreditCardInput.safeParse({ ...input, usualPlan: 'half' }).success).toBe(false);
    expect(removeCreditCardInput.safeParse({ id }).success).toBe(true);
    const paid = { cardId: id, ym: '2026-11' };
    expect(markCardPaidInput.safeParse({ ...paid, paidCents: 0 }).success).toBe(true);
    expect(markCardPaidInput.safeParse({ ...paid, paidCents: -1 }).success).toBe(false);
    expect(unmarkCardPaidInput.safeParse(paid).success).toBe(true);
    expect(unmarkCardPaidInput.safeParse({ ...paid, ym: '2026-13' }).success).toBe(false);
  });

  it('finishes setup step 6 only with a card', () => {
    expect(setupCardsError(0)).toBe('Add a card, or skip for now.');
    expect(setupCardsError(1)).toBeUndefined();
  });

  const draft = {
    cardId: 'c',
    statementText: '142.36',
    minimumText: '25',
    choice: 'full' as const,
    otherText: '',
  };

  it('accepts a filled balance form', () => {
    expect(statementDraftError(draft)).toBeUndefined();
    expect(statementDraftError({ ...draft, choice: 'other', otherText: '100' })).toBeUndefined();
  });

  it.each([
    [{ cardId: '' }, 'Pick a card.'],
    [{ statementText: '' }, 'Enter the statement balance.'],
    [{ minimumText: '' }, 'Enter the minimum payment (0 if there is none).'],
    [{ choice: 'other' as const }, 'Enter the amount you plan to pay.'],
    [{ minimumText: '200' }, 'The minimum can’t be more than the statement balance.'],
    [
      { choice: 'other' as const, otherText: '200' },
      'The planned payment can’t be more than the statement balance.',
    ],
    [{ statementText: '-5' }, 'Enter amounts from $0 to $100,000,000.'],
  ])('says what is wrong with %o', (over, message) => {
    expect(statementDraftError({ ...draft, ...over })).toBe(message);
  });

  it('reads a typed amount only when it is within the card limits', () => {
    expect(parseCardAmount('142.36')).toBe(14_236);
    expect(parseCardAmount('100,000,000')).toBe(10_000_000_000);
    for (const text of ['', 'abc', '-1', '100,000,000.01', '4111111111111111111']) {
      expect(parseCardAmount(text)).toBeNull();
    }
  });

  it('says a card number typed as a balance is out of range', () => {
    expect(statementDraftError({ ...draft, statementText: '4111111111111111' })).toBe(
      'Enter amounts from $0 to $100,000,000.',
    );
  });

  it('checks the amount paid', () => {
    expect(paidDraftError('0')).toBeUndefined();
    expect(paidDraftError('')).toBe('Enter the amount paid.');
    expect(paidDraftError('-1')).toBe('Enter the amount paid.');
    expect(paidDraftError('100,000,000.01')).toBe('Enter an amount of $100,000,000 or less.');
  });
});
