import { describe, expect, it } from 'vitest';
import { MIN_PASSWORD_LENGTH, signUpInput } from './signUp';

const solo = {
  mode: 'solo',
  name: 'Sam',
  email: 'sam@example.com',
  password: 'abcd1234',
  timeZone: 'America/New_York',
};

describe('signUpInput (spec §3 step 2)', () => {
  it('P1-02: a solo sign-up needs no household name', () => {
    expect(signUpInput.safeParse(solo).success).toBe(true);
  });

  it('P1-02: partner sign-up requires a household name', () => {
    expect(signUpInput.safeParse({ ...solo, mode: 'partner' }).success).toBe(false);
    expect(signUpInput.safeParse({ ...solo, mode: 'partner', householdName: '   ' }).success).toBe(
      false,
    );
    const ok = signUpInput.safeParse({ ...solo, mode: 'partner', householdName: ' The Examples ' });
    expect(ok.success).toBe(true);
    expect(ok.data).toMatchObject({ householdName: 'The Examples' });
  });

  it('P1-02: a password under 8 characters is rejected, 8 is accepted', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
    expect(signUpInput.safeParse({ ...solo, password: 'abc1234' }).success).toBe(false);
    expect(signUpInput.safeParse({ ...solo, password: 'abc12345' }).success).toBe(true);
  });

  it('P1-02: the name must not be blank and is trimmed', () => {
    expect(signUpInput.safeParse({ ...solo, name: '  ' }).success).toBe(false);
    expect(signUpInput.safeParse({ ...solo, name: ' Sam ' }).data?.name).toBe('Sam');
  });

  it('P1-02: the email must be valid and is lower-cased and trimmed', () => {
    expect(signUpInput.safeParse({ ...solo, email: 'not-an-email' }).success).toBe(false);
    expect(signUpInput.safeParse({ ...solo, email: ' Sam@Example.COM ' }).data?.email).toBe(
      'sam@example.com',
    );
  });

  it('P1-02: the time zone must be a real IANA zone', () => {
    expect(signUpInput.safeParse({ ...solo, timeZone: 'Mars/Olympus' }).success).toBe(false);
    expect(signUpInput.safeParse({ ...solo, timeZone: '' }).success).toBe(false);
  });

  it('P1-02: an unknown mode is rejected', () => {
    expect(signUpInput.safeParse({ ...solo, mode: 'trio' }).success).toBe(false);
  });

  it('P1-02: each rejection says what to fix (shown on the sign-up form)', () => {
    const message = (over: object) => {
      const r = signUpInput.safeParse({ ...solo, ...over });
      return r.success ? undefined : r.error.issues.map((i) => i.message);
    };
    expect(message({ name: ' ' })).toEqual(['Enter your first name.']);
    expect(message({ email: 'nope' })).toEqual(['Enter a valid email address.']);
    expect(message({ password: 'short' })).toEqual(['Your password needs at least 8 characters.']);
    expect(message({ timeZone: 'Mars/Olympus' })).toEqual(['Unknown time zone.']);
    expect(message({ mode: 'partner', householdName: '' })).toEqual([
      'Give your household a name.',
    ]);
  });
});
