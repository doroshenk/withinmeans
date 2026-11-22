import type { Stage } from './data-stack.js';

/** The public address of a stage's website. */
export function domainForStage(_stage: Stage): string {
  throw new Error('not implemented');
}
