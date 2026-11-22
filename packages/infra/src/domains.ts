import type { Stage } from './data-stack.js';

/** The public address of a stage's website (ADR 0008). */
export function domainForStage(stage: Stage): string {
  return stage === 'prod' ? 'within.doroshenk.com' : 'dev.within.doroshenk.com';
}
