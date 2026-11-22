import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { DataStack, type Stage } from './data-stack.js';

function synth(stage: Stage, connectRoleName?: string): Template {
  const stack = new DataStack(new App(), `DataStack-${stage}`, {
    stage,
    ...(connectRoleName === undefined ? {} : { connectRoleName }),
    env: { account: '111111111111', region: 'us-east-2' },
  });
  return Template.fromStack(stack);
}

describe('P0-07: DataStack', () => {
  it.each(['dev', 'prod'] as const)('P0-07: %s has exactly one single-Region DSQL cluster', (s) => {
    const template = synth(s);
    template.resourceCountIs('AWS::DSQL::Cluster', 1);
    const [cluster] = Object.values(template.findResources('AWS::DSQL::Cluster'));
    expect(cluster?.Properties).not.toHaveProperty('MultiRegionProperties');
  });

  it('P0-07: prod has deletion protection on', () => {
    synth('prod').hasResourceProperties('AWS::DSQL::Cluster', { DeletionProtectionEnabled: true });
  });

  it('P0-07: dev has deletion protection off so it can be torn down', () => {
    synth('dev').hasResourceProperties('AWS::DSQL::Cluster', { DeletionProtectionEnabled: false });
  });

  it('P0-07: prod cluster is retained if the stack is deleted', () => {
    synth('prod').hasResource('AWS::DSQL::Cluster', {
      DeletionPolicy: 'Retain',
      UpdateReplacePolicy: 'Retain',
    });
  });

  it('P0-07: tags the cluster with its stage', () => {
    synth('dev').hasResourceProperties('AWS::DSQL::Cluster', {
      Tags: Match.arrayWith([{ Key: 'Stage', Value: 'dev' }]),
    });
  });

  it('P0-07: outputs the cluster endpoint for the migration runner', () => {
    const outputs = synth('dev').toJSON().Outputs as Record<string, unknown>;
    expect(Object.keys(outputs)).toContain('ClusterEndpoint');
  });

  it('P0-07: connectRoleName grants dsql:DbConnectAdmin on this cluster only', () => {
    const template = synth('dev', 'withinmeans-github-deploy');
    template.hasResourceProperties('AWS::IAM::Policy', {
      Roles: ['withinmeans-github-deploy'],
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'dsql:DbConnectAdmin',
            Effect: 'Allow',
            Resource: Match.objectLike({ 'Fn::GetAtt': [Match.anyValue(), 'ResourceArn'] }),
          }),
        ]),
      },
    });
  });

  it('P0-07: connectRoleName can also read this stack outputs, and nothing wider', () => {
    const template = synth('dev', 'withinmeans-github-deploy');
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'cloudformation:DescribeStacks',
            Effect: 'Allow',
            Resource: { Ref: 'AWS::StackId' },
          }),
        ]),
      },
    });
  });

  it('P0-07: without connectRoleName no IAM policy is created', () => {
    synth('prod').resourceCountIs('AWS::IAM::Policy', 0);
  });

  describe('P0-12: backups', () => {
    it.each(['dev', 'prod'] as const)(
      'P0-12: %s has one vault, one plan and one selection',
      (s) => {
        const template = synth(s);
        template.resourceCountIs('AWS::Backup::BackupVault', 1);
        template.resourceCountIs('AWS::Backup::BackupPlan', 1);
        template.resourceCountIs('AWS::Backup::BackupSelection', 1);
      },
    );

    it('P0-12: the plan has a daily rule that keeps recovery points 14 days', () => {
      synth('dev').hasResourceProperties('AWS::Backup::BackupPlan', {
        BackupPlan: {
          BackupPlanRule: [
            Match.objectLike({
              ScheduleExpression: 'cron(0 5 * * ? *)',
              Lifecycle: { DeleteAfterDays: 14 },
              TargetBackupVault: { Ref: Match.stringLikeRegexp('Vault') },
            }),
          ],
        },
      });
    });

    it('P0-12: the selection is this stage cluster by ARN, with no wildcard', () => {
      synth('dev').hasResourceProperties('AWS::Backup::BackupSelection', {
        BackupSelection: Match.objectLike({
          Resources: [Match.objectLike({ 'Fn::GetAtt': [Match.anyValue(), 'ResourceArn'] })],
        }),
      });
    });

    it('P0-12: the backup role is assumed by AWS Backup and uses the managed backup policy', () => {
      const template = synth('dev');
      template.hasResourceProperties('AWS::IAM::Role', {
        AssumeRolePolicyDocument: {
          Statement: [Match.objectLike({ Principal: { Service: 'backup.amazonaws.com' } })],
        },
        ManagedPolicyArns: Match.arrayWith([
          Match.objectLike({
            'Fn::Join': Match.arrayWith([
              Match.arrayWith([Match.stringLikeRegexp('AWSBackupServiceRolePolicyForBackup$')]),
            ]),
          }),
        ]),
      });
    });

    it('P0-12: prod vault is retained, dev vault is destroyed with the stack', () => {
      synth('prod').hasResource('AWS::Backup::BackupVault', { DeletionPolicy: 'Retain' });
      synth('dev').hasResource('AWS::Backup::BackupVault', { DeletionPolicy: 'Delete' });
    });
  });
});
