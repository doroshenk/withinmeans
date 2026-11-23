import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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
if (certificateArn !== undefined && stage === undefined) {
  throw new Error('--context certificateArn needs --context stage=dev|prod (one ARN per stage)');
}
// The built web app, if `pnpm --filter @withinmeans/web build` has run (the deploy workflow does).
const webDist = fileURLToPath(new URL('../../web/dist', import.meta.url));
buildApp(process.env.CDK_DEFAULT_ACCOUNT, stage, {
  ...(existsSync(webDist) ? { webDist } : {}),
  ...(stage !== undefined && certificateArn !== undefined
    ? { certificateArns: { [stage]: certificateArn } }
    : {}),
});
