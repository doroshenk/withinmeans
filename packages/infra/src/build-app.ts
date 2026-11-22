import { App } from 'aws-cdk-lib';
import { CiStack } from './ci-stack.js';
import { DataStack, type Stage } from './data-stack.js';

const STAGES: readonly Stage[] = ['dev', 'prod'];
/** The deploy role created by CiStack; the dev conformance run connects to the database as it. */
const DEPLOY_ROLE_NAME = 'withinmeans-github-deploy';

/**
 * Builds the CDK app. The account comes from the signed-in AWS profile and is never hard-coded
 * (the repo is public). The region is fixed to us-east-2: the account's service control policy
 * denies the others. Without an account (CI synth), ARNs use the AWS::AccountId pseudo-parameter.
 * With a stage, only that stage's stacks are built (`cdk --context stage=dev`).
 */
export function buildApp(account?: string, stage?: Stage): App {
  const app = new App();
  const env = account === undefined ? { region: 'us-east-2' } : { account, region: 'us-east-2' };
  new CiStack(app, 'CiStack', {
    env,
    githubSubjectPrefix: 'repo:doroshenk@26264461/withinmeans@1464146358',
  });
  for (const s of STAGES.filter((s) => stage === undefined || s === stage)) {
    new DataStack(app, `DataStack-${s}`, {
      env,
      stage: s,
      ...(s === 'dev' ? { connectRoleName: DEPLOY_ROLE_NAME } : {}),
    });
  }
  return app;
}
