import { CfnOutput, Stack, Tags, type StackProps } from 'aws-cdk-lib';
import { Certificate, CertificateValidation } from 'aws-cdk-lib/aws-certificatemanager';
import type { Construct } from 'constructs';
import type { Stage } from './data-stack.js';
import { domainForStage } from './domains.js';

export interface CertificateStackProps extends StackProps {
  readonly stage: Stage;
}

/**
 * The HTTPS certificate for one stage's website. CloudFront only accepts certificates created in
 * us-east-1, so this is the one stack outside us-east-2 (the account's SCP needs an exception for
 * it, see docs/runbooks/aws-account.md). Console: Certificate Manager (us-east-1) → Certificates.
 *
 * There is no Route 53, so DNS validation is manual: while the stack deploys, open the
 * certificate in the console, copy its CNAME name and value into Network Solutions, and the
 * status flips from Pending validation to Issued.
 */
export class CertificateStack extends Stack {
  readonly certificate: Certificate;

  constructor(scope: Construct, id: string, props: CertificateStackProps) {
    super(scope, id, props);
    if (props.env?.region !== 'us-east-1') {
      throw new Error(
        'CertificateStack must be in us-east-1: CloudFront only accepts certificates there',
      );
    }
    this.certificate = new Certificate(this, 'Certificate', {
      domainName: domainForStage(props.stage),
      validation: CertificateValidation.fromDns(),
    });
    Tags.of(this).add('Stage', props.stage);
    new CfnOutput(this, 'CertificateArn', { value: this.certificate.certificateArn });
  }
}
