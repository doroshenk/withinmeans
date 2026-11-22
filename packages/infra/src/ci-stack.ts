import { Stack, type StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';

export interface CiStackProps extends StackProps {
  readonly githubRepo: string;
}

export class CiStack extends Stack {
  constructor(scope: Construct, id: string, props: CiStackProps) {
    super(scope, id, props);
    throw new Error('not implemented');
  }
}
