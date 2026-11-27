import { describe, expect, it } from 'vitest';
import {
  QUICK_ADD_PAGES,
  QUICK_ADD_TYPES,
  quickAddDetail,
  quickAddLandedText,
  quickAddPreviewText,
} from './quickAdd';

describe('P2-10 Quick Add types (spec §5.14)', () => {
  it('offers the first four, as design/QuickAdd.png names them', () => {
    expect(QUICK_ADD_TYPES).toEqual([
      {
        id: 'bill',
        label: 'Bill',
        hint: 'One-time bill or expense',
        heading: 'Add a bill',
        help: 'For one-time bills. Monthly ones belong on Recurring bills.',
      },
      {
        id: 'income',
        label: 'Other income',
        hint: 'Side work, refund, sale, gift',
        heading: 'Add other income',
        help: 'Money that isn’t a scheduled paycheck.',
      },
      {
        id: 'paycheck',
        label: 'Paycheck received',
        hint: 'Mark an expected paycheck',
        heading: 'Mark a paycheck received',
        help: 'The amount that landed replaces the expected one.',
      },
      {
        id: 'card',
        label: 'Card balance',
        hint: 'This month’s statement',
        heading: 'Enter a card balance',
        help: 'What you plan to pay counts toward this month’s bills.',
      },
    ]);
  });

  it('knows the page each type lands on', () => {
    expect(QUICK_ADD_PAGES).toEqual({
      bill: { route: 'bills', name: 'Bills & cash flow' },
      income: { route: 'paychecks', name: 'Paychecks & income' },
      paycheck: { route: 'paychecks', name: 'Paychecks & income' },
      card: { route: 'bills', name: 'Bills & cash flow' },
    });
  });
});

describe('P2-10 where an entry lands', () => {
  it.each([
    ['2026-11-07', 'week 1 of November 2026'],
    ['2026-11-08', 'week 2 of November 2026'],
    ['2026-11-21', 'week 3 of November 2026'],
    ['2026-11-23', 'week 4 of November 2026'],
    ['2027-01-01', 'week 1 of January 2027'],
  ])('Confirmation names the right week and month for %s', (date, where) => {
    expect(quickAddLandedText('bill', 'Dishwasher repair', date)).toBe(
      `Saved Dishwasher repair to Bills & cash flow, ${where}.`,
    );
  });

  it('names each type’s page', () => {
    expect(quickAddLandedText('income', 'Sale', '2026-11-12')).toBe(
      'Saved Sale to Paychecks & income, week 2 of November 2026.',
    );
  });

  it('says where an entry will go while it is typed', () => {
    expect(quickAddPreviewText('bill', '2026-11-23', 'Home')).toBe(
      'Goes to Bills & cash flow · Week 4 (Mon, Nov 23) · Home',
    );
    expect(quickAddPreviewText('income', '2026-11-12')).toBe(
      'Goes to Paychecks & income · Week 2 (Thu, Nov 12)',
    );
  });

  it.each(['', '2026-11-31', 'soon'])('has no preview for the date "%s"', (date) => {
    expect(quickAddPreviewText('bill', date)).toBeNull();
  });

  it('describes an entry in the "Just added" list', () => {
    expect(quickAddDetail('card', '2026-11-27')).toBe('Bills & cash flow · Fri, Nov 27');
  });
});
