import { Stack, type StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import type { Stage } from './data-stack.js';

export interface CertificateStackProps extends StackProps {
  readonly stage: Stage;
}

export class CertificateStack extends Stack {
  constructor(scope: Construct, id: string, props: CertificateStackProps) {
    super(scope, id, props);
    throw new Error(`not implemented: ${props.stage}`);
  }
}
