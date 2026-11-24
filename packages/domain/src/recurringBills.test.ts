import { describe, expect, it } from 'vitest';
import {
  SUGGESTED_BILLS,
  addRecurringBillInput,
  billDraftError,
  isSuggestionUsed,
  monthlyBillsTotal,
  removeRecurringBillInput,
  shareOfTakeHome,
} from './recurringBills';

const ID = '11111111-1111-4111-8111-111111111111';
const valid = { name: 'Rent', estimateText: '1,500.00', dueDayText: '1' };
const NEEDS_ESTIMATE = 'Enter an estimate greater than $0.';

describe('P1-12 recurring bill suggestions (spec §3 step 5)', () => {
  it('offers the 10 suggestions, in order', () => {
    expect(SUGGESTED_BILLS).toEqual([
      'Mortgage',
      'Rent',
      'Electric',
      'Water & sewer',
      'Internet',
      'Phone',
      'Car insurance',
      'Streaming',
      'HOA dues',
      'Gym',
    ]);
  });

  it('a suggestion is crossed out once a bill uses it, ignoring case and spaces', () => {
    expect(isSuggestionUsed('Rent', ['Electric', ' rent '])).toBe(true);
    expect(isSuggestionUsed('Rent', ['Electric'])).toBe(false);
    expect(isSuggestionUsed('Rent', [])).toBe(false);
  });
});

describe('P1-12 bill draft checks', () => {
  it('accepts a complete bill', () => {
    expect(billDraftError(valid)).toBeUndefined();
  });

  it('a name is required', () => {
    expect(billDraftError({ ...valid, name: '   ' })).toBe('Give the bill a name.');
  });

  it('estimate must be > 0', () => {
    for (const estimateText of ['0', '0.00', '-5', '', 'abc']) {
      expect(billDraftError({ ...valid, estimateText })).toBe(NEEDS_ESTIMATE);
    }
    expect(billDraftError({ ...valid, estimateText: '0.01' })).toBeUndefined();
  });

  it('due day 1–28 only', () => {
    const message = 'Pick a due day from 1 to 28.';
    for (const dueDayText of ['0', '29', '31', '-1', '1.5', '', 'x']) {
      expect(billDraftError({ ...valid, dueDayText })).toBe(message);
    }
    for (const dueDayText of ['1', '15', '28']) {
      expect(billDraftError({ ...valid, dueDayText })).toBeUndefined();
    }
  });
});

describe('P1-12 total per month and share of take-home', () => {
  it('sums the estimates', () => {
    expect(monthlyBillsTotal([150_000, 12_050, 9_900])).toBe(171_950);
    expect(monthlyBillsTotal([])).toBe(0);
  });

  it('shows "—" until paychecks exist', () => {
    expect(shareOfTakeHome(275_000, null)).toBe('—');
    expect(shareOfTakeHome(275_000, 0)).toBe('—');
  });

  it('shows the whole-number percent of take-home, rounded to nearest', () => {
    expect(shareOfTakeHome(275_000, 600_000)).toBe('46%');
    expect(shareOfTakeHome(0, 600_000)).toBe('0%');
    expect(shareOfTakeHome(1, 200)).toBe('1%');
    expect(shareOfTakeHome(100, 400_000)).toBe('0%');
    expect(shareOfTakeHome(700_000, 600_000)).toBe('117%');
  });
});

describe('P1-12 API inputs', () => {
  const good = { name: ' Rent ', estimateCents: 150_000, dueDay: 1, categoryId: ID, autopay: true };

  it('trims the name and accepts a full bill', () => {
    expect(addRecurringBillInput.parse(good)).toEqual({ ...good, name: 'Rent' });
  });

  it('rejects estimate <= 0, fractions, and due days outside 1–28', () => {
    for (const bad of [
      { ...good, name: ' ' },
      { ...good, estimateCents: 0 },
      { ...good, estimateCents: -1 },
      { ...good, estimateCents: 10.5 },
      { ...good, dueDay: 0 },
      { ...good, dueDay: 29 },
      { ...good, dueDay: 1.5 },
      { ...good, categoryId: 'nope' },
      { ...good, autopay: 'yes' },
    ]) {
      expect(addRecurringBillInput.safeParse(bad).success).toBe(false);
    }
  });

  it('remove takes a UUID', () => {
    expect(removeRecurringBillInput.safeParse({ id: ID }).success).toBe(true);
    expect(removeRecurringBillInput.safeParse({ id: 'x' }).success).toBe(false);
  });
});
