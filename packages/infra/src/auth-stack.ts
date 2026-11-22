import { Stack, type StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import type { Stage } from './data-stack.js';

export interface AuthStackProps extends StackProps {
  readonly stage: Stage;
}

/** Placeholder so the P0-08 tests fail on assertions, not on a missing import. */
export class AuthStack extends Stack {
  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);
    throw new Error('not implemented');
  }
}
