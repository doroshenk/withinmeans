import { App } from 'aws-cdk-lib';
import { CiStack } from './ci-stack.js';

/**
 * Builds the CDK app. The account comes from the signed-in AWS profile and is never hard-coded
 * (the repo is public). The region is fixed to us-east-2: the account's service control policy
 * denies the others. Without an account (CI synth), ARNs use the AWS::AccountId pseudo-parameter.
 */
export function buildApp(account?: string, _stage?: 'dev' | 'prod'): App {
  const app = new App();
  const env = account === undefined ? { region: 'us-east-2' } : { account, region: 'us-east-2' };
  new CiStack(app, 'CiStack', {
    env,
    githubSubjectPrefix: 'repo:doroshenk@26264461/withinmeans@1464146358',
  });
  return app;
}
