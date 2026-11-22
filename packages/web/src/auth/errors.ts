export const GENERIC_ERROR = 'Something went wrong. Please try again.';

/**
 * Words for a Cognito error. Wrong password and unknown email read the same so the screen never
 * reveals whether an address has an account.
 */
export function authErrorMessage(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  switch (name) {
    case 'NotAuthorizedException':
    case 'UserNotFoundException':
    case 'UserNotConfirmedException':
      return 'Email or password is incorrect.';
    case 'TooManyRequestsException':
    case 'LimitExceededException':
      return 'Too many attempts. Wait a few minutes and try again.';
    case 'PasswordResetRequiredException':
      return 'You need to reset your password.';
    default:
      return GENERIC_ERROR;
  }
}
