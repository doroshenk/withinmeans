import { App } from 'aws-cdk-lib';
import { CiStack } from './ci-stack.js';

const app = new App();

// The account comes from the signed-in AWS profile; never hard-code it (the repo is public).
// The region is fixed to us-east-2: the account's service control policy denies the others.
const account = process.env.CDK_DEFAULT_ACCOUNT;
const env = account === undefined ? { region: 'us-east-2' } : { account, region: 'us-east-2' };

new CiStack(app, 'CiStack', { env, githubRepo: 'doroshenk/withinmeans' });
