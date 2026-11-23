import { CfnOutput, Duration, RemovalPolicy, Stack, Tags, type StackProps } from 'aws-cdk-lib';
import { AccountRecovery, FeaturePlan, UserPool, UserPoolClient } from 'aws-cdk-lib/aws-cognito';
import type { Construct } from 'constructs';
import type { Stage } from './data-stack.js';

export interface AuthStackProps extends StackProps {
  readonly stage: Stage;
}

/**
 * Sign-in for one stage. Console: Cognito → User pools. Cognito holds emails, passwords and
 * tokens; households and roles stay in our database (ADR 0003). We build our own sign-in
 * screens, so there is no hosted UI, domain or OAuth flow. Prod is kept if the stack is removed
 * (deleting a pool deletes every user).
 */
export class AuthStack extends Stack {
  readonly userPool: UserPool;
  readonly client: UserPoolClient;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);
    const isProd = props.stage === 'prod';

    // The pool: users sign in with their email. Essentials is the current free tier (10,000
    // monthly users). Console: the pool → Authentication → Sign-in / Password policy.
    const pool = new UserPool(this, 'UserPool', {
      featurePlan: FeaturePlan.ESSENTIALS,
      // Closed to the public SignUp call: our API creates logins (P1-02), so the answer never
      // reveals which emails exist.
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      autoVerify: { email: true },
      signInCaseSensitive: false,
      // Spec §4: at least 8 characters, nothing else; the web app shows the strength meter.
      passwordPolicy: {
        minLength: 8,
        requireLowercase: false,
        requireUppercase: false,
        requireDigits: false,
        requireSymbols: false,
      },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      removalPolicy: isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });
    Tags.of(pool).add('Stage', props.stage);
    this.userPool = pool;

    // The app client: what the browser app signs in through. Public (no secret, since a
    // browser can't keep one), SRP so the password never travels, and a 30-day refresh token
    // for "Keep me signed in". Console: the pool → Applications → App clients.
    const client = new UserPoolClient(this, 'WebClient', {
      userPool: pool,
      generateSecret: false,
      authFlows: { userSrp: true },
      refreshTokenValidity: Duration.days(30),
      preventUserExistenceErrors: true,
    });

    this.client = client;

    new CfnOutput(this, 'UserPoolId', { value: pool.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', { value: client.userPoolClientId });
  }
}
