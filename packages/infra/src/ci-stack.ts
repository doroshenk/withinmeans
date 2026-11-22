import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import {
  OidcProviderNative,
  PolicyStatement,
  Role,
  WebIdentityPrincipal,
} from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';

export interface CiStackProps extends StackProps {
  /** GitHub repository allowed to deploy, as `owner/name`. */
  readonly githubRepo: string;
  /** GitHub's immutable `sub` prefix: `repo:<owner>@<owner-id>/<repo>@<repo-id>`. */
  readonly githubSubjectPrefix: string;
}

const GITHUB_ISSUER = 'token.actions.githubusercontent.com';
/** Default CDK bootstrap qualifier; see `cdk bootstrap`. */
const BOOTSTRAP_QUALIFIER = 'hnb659fds';
const BOOTSTRAP_ROLES = ['deploy', 'file-publishing', 'image-publishing', 'lookup'] as const;

/**
 * Lets GitHub Actions deploy without stored AWS keys. GitHub hands each workflow run a signed
 * token; the OIDC provider makes AWS trust it; the role below accepts only runs from `main`
 * and `v*` tags (never pull requests, because the repo is public). The role can do one thing:
 * assume the CDK bootstrap roles, which hold the real deploy permissions.
 */
export class CiStack extends Stack {
  constructor(scope: Construct, id: string, props: CiStackProps) {
    super(scope, id, props);

    const provider = new OidcProviderNative(this, 'GithubOidcProvider', {
      url: `https://${GITHUB_ISSUER}`,
      clientIds: ['sts.amazonaws.com'],
    });

    const role = new Role(this, 'DeployRole', {
      roleName: 'withinmeans-github-deploy',
      maxSessionDuration: Duration.hours(1),
      assumedBy: new WebIdentityPrincipal(provider.oidcProviderArn, {
        StringEquals: { [`${GITHUB_ISSUER}:aud`]: 'sts.amazonaws.com' },
        StringLike: {
          [`${GITHUB_ISSUER}:sub`]: [
            `repo:${props.githubRepo}:ref:refs/heads/main`,
            `repo:${props.githubRepo}:ref:refs/tags/v*`,
          ],
        },
      }),
    });

    role.addToPolicy(
      new PolicyStatement({
        actions: ['sts:AssumeRole'],
        resources: BOOTSTRAP_ROLES.map(
          (name) =>
            `arn:aws:iam::${this.account}:role/cdk-${BOOTSTRAP_QUALIFIER}-${name}-role-${this.account}-${this.region}`,
        ),
      }),
    );

    new CfnOutput(this, 'DeployRoleArn', { value: role.roleArn });
  }
}
