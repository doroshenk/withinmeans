import { App } from 'aws-cdk-lib';
import { ApiStack } from './api-stack.js';
import { AuthStack } from './auth-stack.js';
import { CiStack } from './ci-stack.js';
import { CertificateStack } from './certificate-stack.js';
import { DataStack, type Stage } from './data-stack.js';
import { WebStack } from './web-stack.js';

const STAGES: readonly Stage[] = ['dev', 'prod'];
/** The deploy role created by CiStack; the dev conformance run connects to the database as it. */
const DEPLOY_ROLE_NAME = 'withinmeans-github-deploy';

const PLACEHOLDER_CERTIFICATE_ARN =
  'arn:aws:acm:us-east-1:000000000000:certificate/00000000-0000-0000-0000-000000000000';

/**
 * Builds the CDK app. The account comes from the signed-in AWS profile and is never hard-coded
 * (the repo is public). The region is fixed to us-east-2: the account's service control policy
 * denies the others. Without an account (CI synth), ARNs use the AWS::AccountId pseudo-parameter.
 * With a stage, only that stage's stacks are built (`cdk --context stage=dev`).
 */
export function buildApp(
  account?: string,
  stage?: Stage,
  options: { bundle?: boolean; certificateArns?: Partial<Record<Stage, string>> } = {},
): App {
  // Bundling runs esbuild; tests that only inspect templates turn it off.
  const app = new App(
    options.bundle === false ? { context: { 'aws:cdk:bundling-stacks': [] } } : {},
  );
  const env = account === undefined ? { region: 'us-east-2' } : { account, region: 'us-east-2' };
  new CiStack(app, 'CiStack', {
    env,
    githubSubjectPrefix: 'repo:doroshenk@26264461/withinmeans@1464146358',
  });
  for (const s of STAGES.filter((s) => stage === undefined || s === stage)) {
    const auth = new AuthStack(app, `AuthStack-${s}`, { env, stage: s });
    const data = new DataStack(app, `DataStack-${s}`, {
      env,
      stage: s,
      ...(s === 'dev' ? { connectRoleName: DEPLOY_ROLE_NAME } : {}),
    });
    const api = new ApiStack(app, `ApiStack-${s}`, {
      env,
      stage: s,
      clusterArn: data.cluster.attrResourceArn,
      clusterEndpoint: data.cluster.attrEndpoint,
      userPoolId: auth.userPool.userPoolId,
      userPoolClientId: auth.client.userPoolClientId,
    });
    // CloudFront's certificate must live in us-east-1, so it is its own stack. Deploy it by hand
    // first, then pass its ARN with `--context certificateArn=<arn>`.
    new CertificateStack(app, `CertificateStack-${s}`, {
      env: { ...env, region: 'us-east-1' },
      stage: s,
    });
    new WebStack(app, `WebStack-${s}`, {
      env,
      stage: s,
      // Synth-only placeholder when the real ARN isn't known yet (CI); a deploy with it fails.
      certificateArn: options.certificateArns?.[s] ?? PLACEHOLDER_CERTIFICATE_ARN,
      apiUrl: api.api.apiEndpoint,
    });
  }
  return app;
}
