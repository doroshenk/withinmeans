import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { SESv2Client } from '@aws-sdk/client-sesv2';
import { createDsqlDb } from '@withinmeans/db';
import { randomBytes } from 'node:crypto';
import { systemClock } from './clock.js';
import { createCognitoVerifier } from './auth.js';
import { createSesEmailSender, INVITE_FROM_ADDRESS } from './emailSender.js';
import { env } from './env.js';
import { createHandler } from './handler.js';
import { createCognitoIdentityProvider } from './identityProvider.js';
import { createLogger } from './logger.js';

/** The Lambda entry point (CDK: handler `handler`). Built once per cold start, reused after. */
export const handler = createHandler({
  db: createDsqlDb(env('DSQL_ENDPOINT')),
  verifier: createCognitoVerifier({
    userPoolId: env('USER_POOL_ID'),
    clientId: env('USER_POOL_CLIENT_ID'),
  }),
  identityProvider: createCognitoIdentityProvider({
    userPoolId: env('USER_POOL_ID'),
    client: new CognitoIdentityProviderClient({}),
  }),
  clock: systemClock,
  invites: {
    emailSender: createSesEmailSender({ client: new SESv2Client({}), from: INVITE_FROM_ADDRESS }),
    // 256 random bits: unguessable, and URL-safe for the accept link.
    newToken: () => randomBytes(32).toString('base64url'),
    appUrl: env('APP_URL'),
  },
  logger: createLogger((line) => {
    console.log(line);
  }),
});
