import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import type { Stage } from './data-stack.js';
import { JobsStack } from './jobs-stack.js';

const CLUSTER_ARN = 'arn:aws:dsql:us-east-2:111111111111:cluster/abcdefghijklmnopqrstuvwxyz';

function synth(stage: Stage): Template {
  // No bundling: the unit tests must not run esbuild.
  const app = new App({ context: { 'aws:cdk:bundling-stacks': [] } });
  const stack = new JobsStack(app, `JobsStack-${stage}`, {
    stage,
    clusterArn: CLUSTER_ARN,
    clusterEndpoint: 'abcdefghijklmnopqrstuvwxyz.dsql.us-east-2.on.aws',
    env: { account: '111111111111', region: 'us-east-2' },
  });
  return Template.fromStack(stack);
}

interface Statement {
  Action: string | string[];
  Effect: string;
  Resource: unknown;
}

/** The statements on the export function's own role (not the scheduler's). */
function functionStatements(template: Template): Statement[] {
  const [fn] = Object.values(template.findResources('AWS::Lambda::Function'));
  const roleId = (fn?.Properties as { Role: { 'Fn::GetAtt': [string] } } | undefined)?.Role[
    'Fn::GetAtt'
  ][0];
  return Object.values(template.findResources('AWS::IAM::Policy'))
    .map(
      (p) =>
        p.Properties as { Roles: { Ref: string }[]; PolicyDocument: { Statement: Statement[] } },
    )
    .filter((p) => p.Roles.some((r) => r.Ref === roleId))
    .flatMap((p) => p.PolicyDocument.Statement);
}

describe.each(['dev', 'prod'] as const)('P1-14: JobsStack %s export bucket', (stage) => {
  it('is private: all public access blocked', () => {
    const template = synth(stage);
    template.resourceCountIs('AWS::S3::Bucket', 1);
    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  it('refuses requests that are not HTTPS', () => {
    synth(stage).hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Deny',
            Condition: { Bool: { 'aws:SecureTransport': 'false' } },
          }),
        ]),
      },
    });
  });

  it('is versioned and encrypted', () => {
    synth(stage).hasResourceProperties('AWS::S3::Bucket', {
      VersioningConfiguration: { Status: 'Enabled' },
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
          { ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } },
        ],
      },
    });
  });

  it('expires exports, and their old versions, after 90 days', () => {
    synth(stage).hasResourceProperties('AWS::S3::Bucket', {
      LifecycleConfiguration: {
        Rules: [
          Match.objectLike({
            Status: 'Enabled',
            ExpirationInDays: 90,
            NoncurrentVersionExpiration: { NoncurrentDays: 90 },
          }),
        ],
      },
    });
  });
});

describe('P1-14: JobsStack nightly export', () => {
  it.each(['dev', 'prod'] as const)('%s runs the export function daily', (stage) => {
    const template = synth(stage);
    template.resourceCountIs('AWS::Lambda::Function', 1);
    template.resourceCountIs('AWS::Scheduler::Schedule', 1);
    const [functionId] = Object.keys(template.findResources('AWS::Lambda::Function'));
    template.hasResourceProperties('AWS::Scheduler::Schedule', {
      ScheduleExpression: 'cron(0 7 * * ? *)',
      ScheduleExpressionTimezone: 'Etc/UTC',
      State: 'ENABLED',
      Target: Match.objectLike({ Arn: { 'Fn::GetAtt': [functionId, 'Arn'] } }),
    });
  });

  it('runs Node 24 on arm64, with time to export every household', () => {
    synth('dev').hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs24.x',
      Architectures: ['arm64'],
      Timeout: 300,
      Environment: {
        Variables: Match.objectLike({
          DSQL_ENDPOINT: 'abcdefghijklmnopqrstuvwxyz.dsql.us-east-2.on.aws',
          EXPORT_BUCKET: Match.anyValue(),
        }),
      },
    });
  });

  it("lets the function connect to the stage's cluster and write exports, nothing else", () => {
    const template = synth('dev');
    const statements = functionStatements(template);
    expect(statements.flatMap((s) => [s.Action].flat()).sort()).toEqual([
      'dsql:DbConnectAdmin',
      's3:PutObject',
    ]);
    expect(statements.find((s) => s.Action === 'dsql:DbConnectAdmin')?.Resource).toBe(CLUSTER_ARN);
    const [bucketId] = Object.keys(template.findResources('AWS::S3::Bucket'));
    expect(statements.find((s) => s.Action === 's3:PutObject')?.Resource).toEqual({
      'Fn::Join': ['', [{ 'Fn::GetAtt': [bucketId, 'Arn'] }, '/households/*']],
    });
  });

  it('keeps the function log group for 30 days', () => {
    synth('dev').hasResourceProperties('AWS::Logs::LogGroup', { RetentionInDays: 30 });
  });

  it.each([
    ['dev', 'Delete'],
    ['prod', 'Retain'],
  ] as const)('%s bucket removal policy is %s', (stage, policy) => {
    synth(stage).hasResource('AWS::S3::Bucket', { DeletionPolicy: policy });
  });

  it('outputs the bucket name', () => {
    expect(Object.keys(synth('dev').findOutputs('*'))).toContain('ExportBucketName');
  });
});
