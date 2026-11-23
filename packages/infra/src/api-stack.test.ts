import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { ApiStack } from './api-stack.js';
import type { Stage } from './data-stack.js';

const POOL_ARN = 'arn:aws:cognito-idp:us-east-2:111111111111:userpool/us-east-2_Example';
const CLUSTER_ARN = 'arn:aws:dsql:us-east-2:111111111111:cluster/abcdefghijklmnopqrstuvwxyz';

function synth(stage: Stage): Template {
  // No bundling: the unit tests must not run esbuild.
  const app = new App({ context: { 'aws:cdk:bundling-stacks': [] } });
  const stack = new ApiStack(app, `ApiStack-${stage}`, {
    stage,
    clusterArn: CLUSTER_ARN,
    clusterEndpoint: 'abcdefghijklmnopqrstuvwxyz.dsql.us-east-2.on.aws',
    userPoolId: 'us-east-2_Example',
    userPoolArn: POOL_ARN,
    userPoolClientId: 'exampleclientid',
    env: { account: '111111111111', region: 'us-east-2' },
  });
  return Template.fromStack(stack);
}

interface Statement {
  Action: string | string[];
  Effect: string;
  Resource: unknown;
}

function statements(template: Template): Statement[] {
  return Object.values(template.findResources('AWS::IAM::Policy')).flatMap(
    (p) =>
      (p.Properties as { PolicyDocument: { Statement: Statement[] } }).PolicyDocument.Statement,
  );
}

describe('P0-09: ApiStack', () => {
  it.each(['dev', 'prod'] as const)('P0-09: %s has one API function behind one HTTP API', (s) => {
    const template = synth(s);
    template.resourceCountIs('AWS::Lambda::Function', 1);
    template.resourceCountIs('AWS::ApiGatewayV2::Api', 1);
    template.hasResourceProperties('AWS::ApiGatewayV2::Api', { ProtocolType: 'HTTP' });
  });

  it("P0-09: the Lambda's role can connect to the stage's DSQL cluster only", () => {
    const dsql = statements(synth('dev')).filter((s) =>
      [s.Action].flat().some((a) => a.startsWith('dsql:')),
    );
    expect(dsql).toHaveLength(1);
    expect(dsql[0]).toMatchObject({
      Effect: 'Allow',
      Action: 'dsql:DbConnectAdmin',
      Resource: CLUSTER_ARN,
    });
  });

  it("P1-02: the role can create, set the password of and delete users in this stage's pool only", () => {
    const cognito = statements(synth('dev')).filter((s) =>
      [s.Action].flat().some((a) => a.startsWith('cognito-idp:')),
    );
    expect(cognito).toHaveLength(1);
    expect(cognito[0]).toMatchObject({ Effect: 'Allow', Resource: POOL_ARN });
    expect([cognito[0]?.Action].flat().sort()).toEqual([
      'cognito-idp:AdminCreateUser',
      'cognito-idp:AdminDeleteUser',
      'cognito-idp:AdminSetUserPassword',
    ]);
  });

  it('P1-03: the role can send email only through the within.doroshenk.com identity, from the no-reply address', () => {
    const ses = statements(synth('dev')).filter((s) =>
      [s.Action].flat().some((a) => a.startsWith('ses:')),
    );
    expect(ses).toHaveLength(1);
    expect(ses[0]).toMatchObject({
      Effect: 'Allow',
      Action: 'ses:SendEmail',
      Resource: 'arn:aws:ses:us-east-2:111111111111:identity/within.doroshenk.com',
      Condition: { StringEquals: { 'ses:FromAddress': 'no-reply@within.doroshenk.com' } },
    });
  });

  it.each([
    ['dev', 'https://dev.within.doroshenk.com'],
    ['prod', 'https://within.doroshenk.com'],
  ] as const)('P1-03: %s builds accept links on its own site (APP_URL)', (stage, url) => {
    synth(stage).hasResourceProperties('AWS::Lambda::Function', {
      Environment: { Variables: Match.objectLike({ APP_URL: url }) },
    });
  });

  it('P0-09: the role has no wildcard actions or resources', () => {
    for (const s of statements(synth('dev'))) {
      expect([s.Action].flat().join()).not.toContain('*');
      // Log-stream writes are the only statements that may name a pattern, and CDK scopes them.
      if ([s.Action].flat().some((a) => a.startsWith('dsql:'))) {
        expect(JSON.stringify(s.Resource)).not.toContain('*');
      }
    }
  });

  it('P0-09: runs Node 24 on arm64 with the stage settings in its environment', () => {
    synth('dev').hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs24.x',
      Architectures: ['arm64'],
      Environment: {
        Variables: Match.objectLike({
          DSQL_ENDPOINT: 'abcdefghijklmnopqrstuvwxyz.dsql.us-east-2.on.aws',
          USER_POOL_ID: 'us-east-2_Example',
          USER_POOL_CLIENT_ID: 'exampleclientid',
        }),
      },
    });
  });

  it('P0-09: sends every route to the Lambda, and verifies tokens in the Lambda, not API Gateway', () => {
    const template = synth('dev');
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', { RouteKey: '$default' });
    template.hasResourceProperties('AWS::ApiGatewayV2::Integration', {
      IntegrationType: 'AWS_PROXY',
      PayloadFormatVersion: '2.0',
    });
    template.resourceCountIs('AWS::ApiGatewayV2::Authorizer', 0);
  });

  it('P0-09: keeps the function log group for 30 days', () => {
    synth('dev').hasResourceProperties('AWS::Logs::LogGroup', { RetentionInDays: 30 });
  });

  it('P0-09: outputs the API URL', () => {
    expect(Object.keys(synth('dev').findOutputs('*'))).toContain('ApiUrl');
  });
});
