import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { CiStack } from './ci-stack.js';

const ACCOUNT = '111111111111'; // fake account for tests
const REGION = 'us-east-2';
const REPO = 'doroshenk/withinmeans';
// GitHub's immutable subject (the repo has use_immutable_subject on): owner and repo IDs, fake here.
const SUBJECT = 'repo:doroshenk@111/withinmeans@222';
const GITHUB = 'token.actions.githubusercontent.com';

function synth(): Template {
  const app = new App();
  const stack = new CiStack(app, 'CiStack', {
    githubSubjectPrefix: SUBJECT,
    env: { account: ACCOUNT, region: REGION },
  });
  return Template.fromStack(stack);
}

function onlyRole(template: Template): {
  AssumeRolePolicyDocument: PolicyDoc;
  MaxSessionDuration?: number;
} {
  const roles = Object.values(template.findResources('AWS::IAM::Role'));
  expect(roles).toHaveLength(1);
  return (roles[0] as { Properties: unknown }).Properties as {
    AssumeRolePolicyDocument: PolicyDoc;
    MaxSessionDuration?: number;
  };
}

interface Statement {
  Effect: string;
  Action: string | string[];
  Resource?: unknown;
  Principal?: { Federated?: unknown };
  Condition?: Record<string, Record<string, string | string[]>>;
}
interface PolicyDoc {
  Statement: Statement[];
}

describe('P0-05: CiStack GitHub OIDC deploy role', () => {
  it('P0-05: creates exactly one GitHub OIDC provider for sts.amazonaws.com', () => {
    const template = synth();
    template.resourceCountIs('AWS::IAM::OIDCProvider', 1);
    template.hasResourceProperties('AWS::IAM::OIDCProvider', {
      Url: `https://${GITHUB}`,
      ClientIdList: ['sts.amazonaws.com'],
    });
  });

  it('P0-05: the role trusts only the GitHub OIDC provider via AssumeRoleWithWebIdentity', () => {
    const template = synth();
    const { Statement } = onlyRole(template).AssumeRolePolicyDocument;
    expect(Statement).toHaveLength(1);
    const [stmt] = Statement as [Statement];
    expect(stmt.Effect).toBe('Allow');
    expect(stmt.Action).toBe('sts:AssumeRoleWithWebIdentity');
    expect(JSON.stringify(stmt.Principal)).toMatch(/Federated/);
    expect(JSON.stringify(stmt.Principal)).not.toContain('"AWS"');
    expect(JSON.stringify(stmt.Principal)).not.toContain('"Service"');
    expect(JSON.stringify(stmt.Principal?.Federated)).toContain('GithubOidcProvider');
    expect(stmt.Condition?.StringEquals).toMatchObject({ [`${GITHUB}:aud`]: 'sts.amazonaws.com' });
  });

  it('P0-05: sub is limited to refs/heads/main and refs/tags/v*, never pull requests', () => {
    const template = synth();
    const { Statement } = onlyRole(template).AssumeRolePolicyDocument;
    const cond = (Statement[0] as Statement).Condition ?? {};
    // Must be StringLike: in StringEquals the `*` in `v*` would be a literal character.
    const sub = cond.StringLike?.[`${GITHUB}:sub`] ?? 'missing';
    expect([sub].flat().sort()).toEqual([
      `${SUBJECT}:ref:refs/heads/main`,
      `${SUBJECT}:ref:refs/tags/v*`,
    ]);
    expect(JSON.stringify(cond)).not.toContain('pull_request');
  });

  it('P0-05: the role can assume only the CDK bootstrap roles', () => {
    const template = synth();
    const policies = Object.values(template.findResources('AWS::IAM::Policy'));
    expect(policies).toHaveLength(1);
    const doc = (policies[0] as { Properties: { PolicyDocument: PolicyDoc } }).Properties
      .PolicyDocument;
    expect(doc.Statement).toHaveLength(1);
    const [stmt] = doc.Statement as [Statement];
    expect(stmt.Effect).toBe('Allow');
    expect(stmt.Action).toBe('sts:AssumeRole');
    const prefix = `arn:aws:iam::${ACCOUNT}:role/cdk-hnb659fds`;
    const resources = [stmt.Resource].flat().map(String).sort();
    expect(resources).toEqual(
      ['deploy', 'file-publishing', 'image-publishing', 'lookup'].map(
        (r) => `${prefix}-${r}-role-${ACCOUNT}-${REGION}`,
      ),
    );
  });

  it('P0-05: sub uses the immutable owner/repo IDs, not the mutable names', () => {
    const template = synth();
    const { Statement } = onlyRole(template).AssumeRolePolicyDocument;
    const cond = (Statement[0] as Statement).Condition ?? {};
    const sub = [cond.StringLike?.[`${GITHUB}:sub`] ?? []].flat();
    for (const value of sub) {
      expect(value).toMatch(/^repo:[^/@]+@\d+\/[^/@]+@\d+:ref:refs\//);
      expect(value).not.toContain(`repo:${REPO}:`);
    }
    expect(sub).toHaveLength(2);
  });

  it('P0-05: no policy or trust condition uses a bare wildcard', () => {
    const json = JSON.stringify(synth().toJSON());
    expect(json).not.toMatch(/"Resource":"\*"/);
    expect(json).not.toMatch(/"Action":"\*"/);
    expect(json).not.toMatch(/:sub":"(repo:)?\*/);
    expect(json).not.toMatch(/:sub":\[[^\]]*"(repo:)?\*"/);
  });

  it('P0-05: session duration is one hour and the role has a stable name', () => {
    const template = synth();
    expect(onlyRole(template).MaxSessionDuration).toBe(3600);
    template.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'withinmeans-github-deploy',
    });
  });

  it('P0-05: exports the role ARN as a stack output', () => {
    const template = synth();
    template.hasOutput('DeployRoleArn', { Value: Match.anyValue() });
  });
});
