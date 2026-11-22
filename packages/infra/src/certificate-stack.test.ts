import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { CertificateStack } from './certificate-stack.js';
import type { Stage } from './data-stack.js';
import { domainForStage } from './domains.js';

function synth(stage: Stage): Template {
  const app = new App();
  const stack = new CertificateStack(app, `CertificateStack-${stage}`, {
    stage,
    env: { account: '111111111111', region: 'us-east-1' },
  });
  return Template.fromStack(stack);
}

describe('P0-10: CertificateStack', () => {
  it('P0-10: the domain matches the stage', () => {
    expect(domainForStage('prod')).toBe('within.doroshenk.com');
    expect(domainForStage('dev')).toBe('dev.within.doroshenk.com');
  });

  it.each(['dev', 'prod'] as const)(
    'P0-10: %s has one DNS-validated certificate for its own domain',
    (s) => {
      const template = synth(s);
      template.resourceCountIs('AWS::CertificateManager::Certificate', 1);
      template.hasResourceProperties('AWS::CertificateManager::Certificate', {
        DomainName: domainForStage(s),
        ValidationMethod: 'DNS',
      });
    },
  );

  it('P0-10: the stack outputs the certificate ARN', () => {
    expect(Object.keys(synth('dev').toJSON().Outputs as object)).toContain('CertificateArn');
  });

  it('P0-10: the stack must be in us-east-1 (CloudFront only accepts certificates there)', () => {
    const app = new App();
    expect(
      () =>
        new CertificateStack(app, 'Bad', {
          stage: 'dev',
          env: { account: '111111111111', region: 'us-east-2' },
        }),
    ).toThrow(/us-east-1/);
  });
});
