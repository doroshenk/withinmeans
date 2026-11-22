import { buildApp } from './build-app.js';
import type { Stage } from './data-stack.js';

/** `cdk --context stage=dev` reaches the app as JSON in CDK_CONTEXT_JSON. */
export function stageFromContext(_json: string | undefined): Stage | undefined {
  throw new Error('not implemented');
}

buildApp(process.env.CDK_DEFAULT_ACCOUNT);
