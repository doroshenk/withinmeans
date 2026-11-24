import { describe, expect, it } from 'vitest';
import {
  accountDraftError,
  addAccountInput,
  becomesPrimaryChecking,
  parseDollars,
  setCushionInput,
  setupAccountsError,
} from './accounts';

describe('P1-10 parseDollars', () => {
  it.each([
    ['1000', 100_000],
    ['1,234.56', 123_456],
    ['$900', 90_000],
    ['  72.1 ', 7_210],
    ['0', 0],
    ['-14.80', -1_480],
    ['−14.80', -1_480],
    ['.5', 50],
  ])('reads %s as %d cents', (text, cents) => {
    expect(parseDollars(text)).toBe(cents);
  });

  it.each(['', '   ', 'abc', '12.345', '1.2.3', '$', '--5', '1e3'])('rejects %j', (text) => {
    expect(parseDollars(text)).toBeUndefined();
  });
});

describe('P1-10 account checks', () => {
  it('every account needs a name', () => {
    expect(accountDraftError({ name: '  ', type: 'checking', balanceText: '10' })).toBe(
      'Give the account a name.',
    );
  });

  it('every account needs a balance (0 counts, blank does not)', () => {
    expect(accountDraftError({ name: 'Joint', type: 'checking', balanceText: '' })).toBe(
      'Enter the balance today.',
    );
    expect(accountDraftError({ name: 'Joint', type: 'checking', balanceText: 'lots' })).toBe(
      'Enter the balance today.',
    );
    expect(
      accountDraftError({ name: 'Joint', type: 'checking', balanceText: '0' }),
    ).toBeUndefined();
  });

  it('at least one account is required', () => {
    expect(setupAccountsError(0)).toBe('Add at least one account.');
    expect(setupAccountsError(1)).toBeUndefined();
  });

  it('the first checking account becomes primary; later ones and other types do not', () => {
    expect(becomesPrimaryChecking('checking', false)).toBe(true);
    expect(becomesPrimaryChecking('checking', true)).toBe(false);
    expect(becomesPrimaryChecking('savings', false)).toBe(false);
    expect(becomesPrimaryChecking('cash', false)).toBe(false);
  });
});

describe('P1-10 inputs', () => {
  it('addAccountInput needs a name and a whole-cent balance', () => {
    const ok = { name: ' Joint ', type: 'checking', balanceCents: 100_000 };
    expect(addAccountInput.parse(ok).name).toBe('Joint');
    expect(addAccountInput.safeParse({ ...ok, name: ' ' }).success).toBe(false);
    expect(addAccountInput.safeParse({ ...ok, balanceCents: undefined }).success).toBe(false);
    expect(addAccountInput.safeParse({ ...ok, balanceCents: 1.5 }).success).toBe(false);
    expect(addAccountInput.safeParse({ ...ok, type: 'brokerage' }).success).toBe(false);
  });

  it('the cushion is whole cents, not negative', () => {
    expect(setCushionInput.safeParse({ cushionCents: 100_000 }).success).toBe(true);
    expect(setCushionInput.safeParse({ cushionCents: -1 }).success).toBe(false);
    expect(setCushionInput.safeParse({ cushionCents: 0.5 }).success).toBe(false);
  });
});
