import { Stack, type StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';

export type Stage = 'dev' | 'prod';

export interface DataStackProps extends StackProps {
  readonly stage: Stage;
  /** Name of an existing IAM role that may connect to this cluster as admin (dev conformance run). */
  readonly connectRoleName?: string;
}

export class DataStack extends Stack {
  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);
    throw new Error('not implemented');
  }
}
