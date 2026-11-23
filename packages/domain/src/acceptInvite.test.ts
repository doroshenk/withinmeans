import { describe, expect, it } from 'vitest';
import { acceptInviteInput } from './acceptInvite';

const valid = { token: 'abc', name: ' Pat ', email: ' Pat@Example.TEST ', password: 'abcd1234' };

describe('P1-04: acceptInviteInput', () => {
  it('P1-04: trims the name and lower-cases the email', () => {
    expect(acceptInviteInput.parse(valid)).toEqual({
      token: 'abc',
      name: 'Pat',
      email: 'pat@example.test',
      password: 'abcd1234',
    });
  });

  it.each([
    ['a missing token', { ...valid, token: '' }, undefined],
    ['an empty name', { ...valid, name: '  ' }, 'Enter your first name.'],
    ['a bad email', { ...valid, email: 'pat' }, 'Enter a valid email address.'],
    [
      'a short password',
      { ...valid, password: 'abc1234' },
      'Your password needs at least 8 characters.',
    ],
  ])('P1-04: rejects %s', (_label, input, message) => {
    const result = acceptInviteInput.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success && message !== undefined) {
      expect(result.error.issues[0]?.message).toBe(message);
    }
  });
});
