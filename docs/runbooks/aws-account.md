# AWS account runbook

The Within Means AWS account: how it was set up, what to check, and the dates to track.
This repo is public. Never write the account ID, email addresses or keys here. Keep the
account ID in your own shell as `WITHINMEANS_AWS_ACCOUNT_ID`.

## Accounts and billing

Within Means runs in a **member account** of the owner's AWS Organization. The organization's
**management account** pays for everything, and the Free plan credits live there, not in the
member account. The member account's Billing pages are empty or read-only.

## Dates to track

- Free plan credit expiry: 2027-11-12
- Free plan credits: $120
- Read both in the **management account**: Billing and Cost Management → Free Tier.
- **Before that date, switch the management account to the Paid plan** (Billing and Cost
  Management → Account → Account plan). If you don't, the Free plan ends and the account is
  closed (ADR 0001). Set a calendar reminder for 2027-10-29.

## Region

Everything deploys to **us-east-2 (Ohio)**. A service control policy (SCP) from the owning
organization denies other regions, for example CloudFormation in us-east-1.

- The SCP can't be changed from this account. The owner can edit it in the management account
  (Organizations → Policies → Service control policies).
- CloudFront needs its ACM certificate in us-east-1, so the custom-domain ticket must add a
  narrow SCP exception for that.
- When you look for a stack in the console, set the region selector to us-east-2 first.

## Baseline checklist (P0-04)

Only the owner can do the console steps. Order matters.

1. **Root MFA.** Sign in as the root user → account menu → Security credentials →
   Multi-factor authentication → Assign MFA device. Afterwards, never use root for daily work.
2. **Admin user.** This account sits in an AWS Organization owned by someone else, so
   IAM Identity Center can't be enabled. Use an IAM user instead: IAM → Users → Create user
   `withinmeans-admin` with console access → attach `AdministratorAccess` → register MFA.
3. **CLI profile `withinmeans`.** Run `aws login --profile withinmeans --region us-east-2`
   in PowerShell (it needs a real Windows console) and sign in as the IAM user. Sign in
   again the same way when the session expires.
4. **Budget.** Billing and Cost Management → Budgets → Create budget → Cost budget, monthly,
   $1, alert at 100% of actual cost to the owner's email.
5. **Credit expiry.** In the management account, Billing and Cost Management → Free Tier:
   confirm the date above.
6. **CDK bootstrap.** Run `cdk bootstrap aws://<account>/us-east-2` once, using the
   `withinmeans` profile.

## Verify

```bash
export WITHINMEANS_AWS_ACCOUNT_ID=<12-digit account id>
aws sts get-caller-identity --profile withinmeans
pnpm exec vitest run --project tooling tooling/aws
```

The ARN must end in `user/withinmeans-admin`, not `:root`.

## Find it in the console

- **Free Tier:** management account → Billing and Cost Management → Free Tier. Remaining
  credits and the end date.
- **Admin user and MFA:** IAM → Users → `withinmeans-admin` → Security credentials → MFA. Root MFA:
  account menu → Security credentials.
- **Budget:** Billing and Cost Management → Budgets → the $1 budget and its alert.
- **CDKToolkit:** CloudFormation → Stacks (us-east-2) → `CDKToolkit`, created by `cdk bootstrap`. It holds
  the S3 bucket, the ECR repository and the IAM roles that CDK deploys through. Never delete it.

## GitHub deploy role (P0-05)

GitHub Actions deploys without stored AWS keys. GitHub gives each run a short-lived signed
token, an **OIDC identity provider** in AWS makes AWS trust it, and the IAM role
`withinmeans-github-deploy` accepts only runs from `main` and `v*` tags (never pull requests,
because the repo is public). The role can only assume the CDK bootstrap roles.

- **Defined in:** `packages/infra/src/ci-stack.ts` (`CiStack`, one per account, not per stage).
- **Deployed once by hand** with the admin profile, because the role can't deploy itself:
  `AWS_PROFILE=withinmeans pnpm --filter @withinmeans/infra exec cdk deploy CiStack`. Redeploy
  the same way after changing the stack, until a deploy workflow takes over.
- **GitHub repository variable** `AWS_DEPLOY_ROLE_ARN` holds the role ARN (it contains the
  account ID, so it lives in GitHub settings, not in the repo): Settings → Secrets and variables
  → Actions → Variables.
- **Check it:** Actions → "AWS identity check" → Run workflow on `main`. The log shows
  `aws sts get-caller-identity` returning an assumed-role ARN for `withinmeans-github-deploy`.

### Find it in the console (set the region to us-east-2)

- **IAM → Identity providers:** `token.actions.githubusercontent.com`, the GitHub OIDC provider.
- **IAM → Roles → `withinmeans-github-deploy` → Trust relationships:** the trust policy. Read the
  `sub` condition: only `main` and `v*` tags.
- **IAM → Roles → `withinmeans-github-deploy` → Permissions:** the one policy, `sts:AssumeRole`
  on the four `cdk-hnb659fds-*` bootstrap roles.
- **CloudFormation → Stacks → `CiStack`:** the stack that created all three.
