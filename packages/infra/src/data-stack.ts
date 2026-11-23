import { CfnOutput, Duration, RemovalPolicy, Stack, Tags, type StackProps } from 'aws-cdk-lib';
import { BackupPlan, BackupPlanRule, BackupResource, BackupVault } from 'aws-cdk-lib/aws-backup';
import { CfnCluster } from 'aws-cdk-lib/aws-dsql';
import { Schedule } from 'aws-cdk-lib/aws-events';
import {
  ManagedPolicy,
  Policy,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';

export type Stage = 'dev' | 'prod';

export interface DataStackProps extends StackProps {
  readonly stage: Stage;
  /** Name of an existing IAM role that may connect to this cluster as admin (dev conformance run). */
  readonly connectRoleName?: string;
}

/**
 * The database for one stage: a single-Region Aurora DSQL cluster (console: Aurora DSQL →
 * Clusters). DSQL has no instances to size; you pay per request unit (DPU) and the Always Free
 * allowance covers a household. Prod is protected from deletion and kept if the stack is removed.
 */
export class DataStack extends Stack {
  readonly cluster: CfnCluster;
  /** Where this stage's recovery points live (console: AWS Backup → Vaults). */
  readonly backupVault: BackupVault;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);
    const isProd = props.stage === 'prod';

    const cluster = new CfnCluster(this, 'Cluster', { deletionProtectionEnabled: isProd });
    this.cluster = cluster;
    if (isProd) cluster.applyRemovalPolicy(RemovalPolicy.RETAIN);
    Tags.of(cluster).add('Stage', props.stage);

    // Backups (ADR 0014). Console: AWS Backup → Backup plans (the schedule), Vaults (the stored
    // recovery points), Jobs (each run). The plan takes a recovery point daily at 05:00 UTC and
    // keeps it 14 days; the prod deploy also starts an on-demand job (scripts/backup-now.sh).
    // Prod's vault is kept if the stack is removed. Dev's is deleted with the stack, which only
    // works once it holds no recovery points (empty it first, see docs/runbooks/restore.md).
    this.backupVault = new BackupVault(this, 'Vault', {
      removalPolicy: isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });
    const plan = new BackupPlan(this, 'Plan', {
      backupVault: this.backupVault,
      backupPlanRules: [
        new BackupPlanRule({
          ruleName: 'Daily',
          scheduleExpression: Schedule.cron({ minute: '0', hour: '5' }),
          deleteAfter: Duration.days(14),
        }),
      ],
    });
    // The role AWS Backup assumes to read the cluster (console: IAM → Roles). The AWS-managed
    // policy is the standard one for backups.
    const backupRole = new Role(this, 'BackupRole', {
      assumedBy: new ServicePrincipal('backup.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSBackupServiceRolePolicyForBackup'),
      ],
    });
    // Selects this stage's cluster by ARN and nothing else.
    plan.addSelection('Cluster', {
      role: backupRole,
      resources: [BackupResource.fromArn(cluster.attrResourceArn)],
    });

    new CfnOutput(this, 'BackupVaultName', {
      value: this.backupVault.backupVaultName,
      description: 'Vault the on-demand backup script writes to',
    });

    new CfnOutput(this, 'ClusterArn', {
      value: cluster.attrResourceArn,
      description: 'Cluster the on-demand backup script backs up',
    });
    new CfnOutput(this, 'BackupRoleArn', {
      value: backupRole.roleArn,
      description: 'Role AWS Backup assumes for the on-demand backup script',
    });

    new CfnOutput(this, 'ClusterEndpoint', {
      value: cluster.attrEndpoint,
      description: 'Host name the migration runner and API connect to',
    });

    if (props.connectRoleName !== undefined) {
      const role = Role.fromRoleName(this, 'ConnectRole', props.connectRoleName);
      // One policy per stage on the shared deploy role. Dev and prod both attach to the same
      // role, so the name must include the stage: a generated name is identical in both stacks
      // and AWS refuses the second ("already managed by another stack").
      new Policy(this, 'ConnectPolicy', {
        policyName: `withinmeans-data-connect-${props.stage}`,
        roles: [role],
        statements: [
          // Connecting needs an IAM token, not a password: this lets the role mint one, for this
          // cluster only.
          new PolicyStatement({
            actions: ['dsql:DbConnectAdmin'],
            resources: [cluster.attrResourceArn],
          }),
          // The prod deploy takes an on-demand backup before migrating (scripts/backup-now.sh):
          // start a job in this stack's vault, watch it, and hand AWS Backup its role (and only
          // that role).
          new PolicyStatement({
            actions: ['backup:StartBackupJob'],
            resources: [this.backupVault.backupVaultArn],
          }),
          new PolicyStatement({ actions: ['backup:DescribeBackupJob'], resources: ['*'] }),
          new PolicyStatement({
            actions: ['iam:PassRole'],
            resources: [backupRole.roleArn],
            conditions: { StringEquals: { 'iam:PassedToService': 'backup.amazonaws.com' } },
          }),
          // Lets the run read this stack's outputs (the endpoint) with
          // `aws cloudformation describe-stacks`.
          new PolicyStatement({
            actions: ['cloudformation:DescribeStacks'],
            resources: [this.stackId],
          }),
        ],
      });
    }
  }
}
