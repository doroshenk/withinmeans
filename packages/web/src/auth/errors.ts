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
    case 'CodeMismatchException':
      return "That code isn't right. Check it and try again.";
    case 'ExpiredCodeException':
      return 'That code has expired. Go back and request a new one.';
    case 'InvalidPasswordException':
      return 'Choose a stronger password.';
    case 'PasswordResetRequiredException':
      return 'You need to reset your password.';
    default:
      return GENERIC_ERROR;
  }
}

const SHOWN_CODES = new Set(['BAD_REQUEST', 'CONFLICT', 'FORBIDDEN', 'NOT_FOUND']);

/**
 * Words for an API error. The API only sends a message for a rule the user can act on (such as
 * "An invite is already waiting"); everything else stays generic.
 */
export function apiErrorMessage(error: unknown): string {
  if (error instanceof Error && error.name === 'TRPCClientError') {
    const code = (error as { data?: { code?: string } }).data?.code;
    if (code !== undefined && SHOWN_CODES.has(code)) return error.message;
  }
  return GENERIC_ERROR;
}
