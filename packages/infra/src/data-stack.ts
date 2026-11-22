import { CfnOutput, RemovalPolicy, Stack, Tags, type StackProps } from 'aws-cdk-lib';
import { CfnCluster } from 'aws-cdk-lib/aws-dsql';
import { PolicyStatement, Role } from 'aws-cdk-lib/aws-iam';
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
  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);
    const isProd = props.stage === 'prod';

    const cluster = new CfnCluster(this, 'Cluster', { deletionProtectionEnabled: isProd });
    if (isProd) cluster.applyRemovalPolicy(RemovalPolicy.RETAIN);
    Tags.of(cluster).add('Stage', props.stage);

    new CfnOutput(this, 'ClusterEndpoint', {
      value: cluster.attrEndpoint,
      description: 'Host name the migration runner and API connect to',
    });

    if (props.connectRoleName !== undefined) {
      // Connecting needs an IAM token, not a password. This lets one named role mint it, for
      // this cluster only.
      const role = Role.fromRoleName(this, 'ConnectRole', props.connectRoleName);
      role.addToPrincipalPolicy(
        new PolicyStatement({
          actions: ['dsql:DbConnectAdmin'],
          resources: [cluster.attrResourceArn],
        }),
      );
      // Lets the run read this stack's outputs (the endpoint) with `aws cloudformation describe-stacks`.
      role.addToPrincipalPolicy(
        new PolicyStatement({
          actions: ['cloudformation:DescribeStacks'],
          resources: [this.stackId],
        }),
      );
    }
  }
}
