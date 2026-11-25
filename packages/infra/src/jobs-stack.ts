import { CfnOutput, Duration, RemovalPolicy, Stack, Tags, type StackProps } from 'aws-cdk-lib';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { BlockPublicAccess, Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3';
import { Schedule, ScheduleExpression } from 'aws-cdk-lib/aws-scheduler';
import { LambdaInvoke } from 'aws-cdk-lib/aws-scheduler-targets';
import type { Construct } from 'constructs';
import type { Stage } from './data-stack.js';
import { nodeLambdaDefaults } from './node-lambda.js';

export interface JobsStackProps extends StackProps {
  readonly stage: Stage;
  /** The stage's DSQL cluster: the only database the jobs may connect to. */
  readonly clusterArn: string;
  readonly clusterEndpoint: string;
}

/**
 * Scheduled jobs for one stage. There is one: the nightly JSON export of every household
 * (ADR 0014). Console: EventBridge → Scheduler → Schedules (the timetable), Lambda → Functions
 * (the export function and its Monitor → Logs), S3 → Buckets (the exports; turn on "Show
 * versions" to see earlier nights).
 */
export class JobsStack extends Stack {
  constructor(scope: Construct, id: string, props: JobsStackProps) {
    super(scope, id, props);
    const isProd = props.stage === 'prod';

    // Private, HTTPS only, encrypted with S3's own keys (free). Each night overwrites the same
    // object per household; versioning keeps the earlier ones. Exports and old versions are
    // deleted after 90 days. Prod's bucket is kept if the stack is removed. Dev's is deleted with
    // the stack, which only works once it is empty.
    const bucket = new Bucket(this, 'Exports', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      encryption: BucketEncryption.S3_MANAGED,
      versioned: true,
      lifecycleRules: [
        { expiration: Duration.days(90), noncurrentVersionExpiration: Duration.days(90) },
      ],
      removalPolicy: isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    const logGroup = new LogGroup(this, 'ExportLogs', {
      retention: RetentionDays.ONE_MONTH,
      removalPolicy: isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    // The export function (shared settings in node-lambda.ts).
    const fn = new NodejsFunction(this, 'ExportFunction', {
      ...nodeLambdaDefaults('packages/api/src/exportLambda.ts'),
      timeout: Duration.minutes(5),
      logGroup,
      environment: {
        DSQL_ENDPOINT: props.clusterEndpoint,
        EXPORT_BUCKET: bucket.bucketName,
        NODE_OPTIONS: '--enable-source-maps',
      },
    });

    // Connect to this stage's cluster (admin until the scoped database role, as in the API), and
    // write exports. It cannot read, list or delete what is in the bucket.
    fn.addToRolePolicy(
      new PolicyStatement({ actions: ['dsql:DbConnectAdmin'], resources: [props.clusterArn] }),
    );
    fn.addToRolePolicy(
      new PolicyStatement({
        actions: ['s3:PutObject'],
        resources: [bucket.arnForObjects('households/*')],
      }),
    );

    // Every night at 07:00 UTC (the middle of the night in US time zones). CDK creates the small
    // role the scheduler assumes to invoke the function.
    new Schedule(this, 'NightlyExport', {
      description: 'Nightly JSON export of every household',
      schedule: ScheduleExpression.cron({ minute: '0', hour: '7' }),
      target: new LambdaInvoke(fn),
    });
    Tags.of(this).add('Stage', props.stage);

    new CfnOutput(this, 'ExportBucketName', { value: bucket.bucketName });
    new CfnOutput(this, 'ExportFunctionName', { value: fn.functionName });
  }
}
