import { createDsqlDb } from '@withinmeans/db';
import { createCognitoVerifier } from './auth.js';
import { createHandler } from './handler.js';
import { createLogger } from './logger.js';

function env(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') throw new Error(`Missing environment variable ${name}`);
  return value;
}

/** The Lambda entry point (CDK: handler `handler`). Built once per cold start, reused after. */
export const handler = createHandler({
  db: createDsqlDb(env('DSQL_ENDPOINT')),
  verifier: createCognitoVerifier({
    userPoolId: env('USER_POOL_ID'),
    clientId: env('USER_POOL_CLIENT_ID'),
  }),
  logger: createLogger((line) => {
    console.log(line);
  }),
});
