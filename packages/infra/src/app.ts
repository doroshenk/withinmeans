import { buildApp } from './build-app.js';
import type { Stage } from './data-stack.js';

/** `cdk --context stage=dev` reaches the app as JSON in CDK_CONTEXT_JSON. */
export function stageFromContext(json: string | undefined): Stage | undefined {
  const stage = (JSON.parse(json ?? '{}') as { stage?: unknown }).stage;
  if (stage === undefined) return undefined;
  if (stage === 'dev' || stage === 'prod') return stage;
  throw new Error(`Unknown stage "${String(stage)}": use dev or prod`);
}

const stage = stageFromContext(process.env.CDK_CONTEXT_JSON);
const certificateArn = (
  JSON.parse(process.env.CDK_CONTEXT_JSON ?? '{}') as { certificateArn?: string }
).certificateArn;
buildApp(process.env.CDK_DEFAULT_ACCOUNT, stage, {
  ...(stage !== undefined && certificateArn !== undefined
    ? { certificateArns: { [stage]: certificateArn } }
    : {}),
});
