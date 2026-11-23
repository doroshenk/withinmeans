import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { EmailStack } from './email-stack.js';

function synth(): Template {
  const stack = new EmailStack(new App(), 'EmailStack', {
    env: { account: '111111111111', region: 'us-east-2' },
  });
  return Template.fromStack(stack);
}

describe('P1-03: EmailStack', () => {
  it('P1-03: has one SES identity, the subdomain within.doroshenk.com, never the root domain', () => {
    const template = synth();
    template.resourceCountIs('AWS::SES::EmailIdentity', 1);
    template.hasResourceProperties('AWS::SES::EmailIdentity', {
      EmailIdentity: 'within.doroshenk.com',
    });
    expect(JSON.stringify(template.toJSON())).not.toMatch(/"EmailIdentity":"doroshenk\.com"/);
  });

  it('P1-03: signs mail with DKIM (Easy DKIM, 2048-bit keys)', () => {
    synth().hasResourceProperties('AWS::SES::EmailIdentity', {
      DkimAttributes: { SigningEnabled: true },
      DkimSigningAttributes: { NextSigningKeyLength: 'RSA_2048_BIT' },
    });
  });

  it('P1-03: outputs the 3 DKIM CNAMEs (name and value) to copy into Network Solutions', () => {
    const outputs = Object.keys(synth().findOutputs('*'));
    for (const n of [1, 2, 3]) {
      expect(outputs).toContain(`DkimName${String(n)}`);
      expect(outputs).toContain(`DkimValue${String(n)}`);
    }
  });

  it('P1-03: creates no other mail resources (no mailbox rules, no receiving)', () => {
    const types = Object.values(synth().toJSON().Resources as Record<string, { Type: string }>).map(
      (r) => r.Type,
    );
    expect(types.filter((t) => t.startsWith('AWS::SES::'))).toEqual(['AWS::SES::EmailIdentity']);
  });
});
