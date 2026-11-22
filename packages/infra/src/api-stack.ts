import { Stack, type StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import type { Stage } from './data-stack.js';

export interface ApiStackProps extends StackProps {
  readonly stage: Stage;
  readonly clusterArn: string;
  readonly clusterEndpoint: string;
  readonly userPoolId: string;
  readonly userPoolClientId: string;
}

export class ApiStack extends Stack {
  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);
    throw new Error('not implemented');
  }
}
