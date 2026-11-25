import { Stack, type StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import type { Stage } from './data-stack.js';

export interface JobsStackProps extends StackProps {
  readonly stage: Stage;
  /** The stage's DSQL cluster: the only database the jobs may connect to. */
  readonly clusterArn: string;
  readonly clusterEndpoint: string;
}

/** Scheduled jobs for one stage. Not implemented yet. */
export class JobsStack extends Stack {
  constructor(scope: Construct, id: string, props: JobsStackProps) {
    super(scope, id, props);
  }
}
