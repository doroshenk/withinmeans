import { fileURLToPath } from 'node:url';
import { CfnOutput, Duration, RemovalPolicy, Stack, Tags, type StackProps } from 'aws-cdk-lib';
import { HttpApi } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';
import type { Stage } from './data-stack.js';
import { domainForStage } from './domains.js';
import { MAIL_DOMAIN } from './email-stack.js';

export interface ApiStackProps extends StackProps {
  readonly stage: Stage;
  /** The stage's DSQL cluster: the only thing the function is allowed to connect to. */
  readonly clusterArn: string;
  readonly clusterEndpoint: string;
  readonly userPoolId: string;
  readonly userPoolArn: string;
  readonly userPoolClientId: string;
}

const fromRoot = (path: string): string =>
  fileURLToPath(new URL(`../../../${path}`, import.meta.url));

/**
 * The API for one stage: one Lambda running tRPC behind an HTTP API (ADR 0010).
 * Console: Lambda → Functions (the function and its Monitor → Logs), CloudWatch → Log groups,
 * API Gateway → APIs (the HTTP API and its routes), IAM → Roles (the function's role).
 */
export class ApiStack extends Stack {
  readonly api: HttpApi;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);
    const isProd = props.stage === 'prod';

    // Where the function's logs go. The API never logs amounts (CLAUDE.md privacy rules).
    const logGroup = new LogGroup(this, 'ApiLogs', {
      retention: RetentionDays.ONE_MONTH,
      removalPolicy: isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    // The function. esbuild bundles packages/api/src/lambda.ts and what it imports into one file.
    // arm64 (Graviton) is the cheaper architecture; the Node 24 runtime matches local dev.
    const fn = new NodejsFunction(this, 'ApiFunction', {
      entry: fromRoot('packages/api/src/lambda.ts'),
      depsLockFilePath: fromRoot('pnpm-lock.yaml'),
      handler: 'handler',
      runtime: Runtime.NODEJS_24_X,
      architecture: Architecture.ARM_64,
      memorySize: 512,
      timeout: Duration.seconds(10),
      logGroup,
      // ESM output: our db package reads import.meta.url, which CommonJS output would empty.
      // The banner gives bundled CommonJS dependencies (pg) a working require().
      bundling: {
        format: OutputFormat.ESM,
        minify: true,
        sourceMap: true,
        // Bundle the AWS SDK too: the runtime does not ship the DSQL signer.
        externalModules: ['pg-native'],
        banner:
          "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
      },
      environment: {
        DSQL_ENDPOINT: props.clusterEndpoint,
        USER_POOL_ID: props.userPoolId,
        USER_POOL_CLIENT_ID: props.userPoolClientId,
        // Invite emails link to this site's accept screen.
        APP_URL: `https://${domainForStage(props.stage)}`,
        NODE_OPTIONS: '--enable-source-maps',
      },
    });

    // Phase 0 connects as the DSQL admin role, which is broader than ideal. The policy is pinned
    // to this one cluster; a scoped database role with dsql:DbConnect is planned for later.
    // The function's role may mint a database sign-in token for this stage's cluster, and
    // nothing else beyond writing its own logs. Console: IAM → Roles → the ApiFunction role.
    fn.addToRolePolicy(
      new PolicyStatement({ actions: ['dsql:DbConnectAdmin'], resources: [props.clusterArn] }),
    );

    // Sign-up runs in the function (so it never reveals which emails exist), which therefore
    // needs to create, set the password of and delete users in this stage's pool, and nothing
    // else. Console: IAM -> Roles -> the ApiFunction role -> Permissions.
    fn.addToRolePolicy(
      new PolicyStatement({
        actions: [
          'cognito-idp:AdminCreateUser',
          'cognito-idp:AdminSetUserPassword',
          'cognito-idp:AdminDeleteUser',
        ],
        resources: [props.userPoolArn],
      }),
    );

    // Partner invites go out through SES, from the one no-reply address only, via the domain
    // identity created by EmailStack. Console: IAM -> Roles -> the ApiFunction role -> Permissions.
    fn.addToRolePolicy(
      new PolicyStatement({
        actions: ['ses:SendEmail'],
        resources: [
          this.formatArn({ service: 'ses', resource: 'identity', resourceName: MAIL_DOMAIN }),
        ],
        conditions: { StringEquals: { 'ses:FromAddress': `no-reply@${MAIL_DOMAIN}` } },
      }),
    );

    // The HTTP API sends every route to the function. It has no authorizer on purpose: the
    // function verifies the Cognito token itself (ADR 0003), so there is no paid authorizer.
    const api = (this.api = new HttpApi(this, 'HttpApi', {
      defaultIntegration: new HttpLambdaIntegration('ApiIntegration', fn),
    }));
    Tags.of(this).add('Stage', props.stage);

    new CfnOutput(this, 'ApiUrl', { value: api.apiEndpoint });
  }
}
