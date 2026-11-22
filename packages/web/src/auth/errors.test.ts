import { describe, expect, it } from 'vitest';
import { authErrorMessage, GENERIC_ERROR } from './errors';

const named = (name: string) => Object.assign(new Error('x'), { name });

describe('authErrorMessage', () => {
  it.each(['NotAuthorizedException', 'UserNotFoundException', 'UserNotConfirmedException'])(
    '%s reads as a wrong email or password',
    (name) => {
      expect(authErrorMessage(named(name))).toBe('Email or password is incorrect.');
    },
  );

  it.each(['TooManyRequestsException', 'LimitExceededException'])('%s asks to wait', (name) => {
    expect(authErrorMessage(named(name))).toBe(
      'Too many attempts. Wait a few minutes and try again.',
    );
  });

  it('tells the user to reset the password when Cognito requires it', () => {
    expect(authErrorMessage(named('PasswordResetRequiredException'))).toBe(
      'You need to reset your password.',
    );
  });

  it('falls back to a generic message, including for non-Error values', () => {
    expect(authErrorMessage(new Error('socket hang up'))).toBe(GENERIC_ERROR);
    expect(authErrorMessage('boom')).toBe(GENERIC_ERROR);
  });
});
