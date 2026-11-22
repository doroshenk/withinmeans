import { Stack, type StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import type { Stage } from './data-stack.js';

export interface WebStackProps extends StackProps {
  readonly stage: Stage;
  /** ARN of the stage's ACM certificate in us-east-1. */
  readonly certificateArn: string;
  /** The HTTP API's endpoint URL, e.g. https://abc.execute-api.us-east-2.amazonaws.com */
  readonly apiUrl: string;
}

export class WebStack extends Stack {
  constructor(scope: Construct, id: string, props: WebStackProps) {
    super(scope, id, props);
    throw new Error(`not implemented: ${props.stage}`);
  }
}
