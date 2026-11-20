# AWS account runbook

The Within Means AWS account: how it was set up, what to check, and the dates to track.
This repo is public. Never write the account ID, email addresses or keys here. Keep the
account ID in your own shell as `WITHINMEANS_AWS_ACCOUNT_ID`.

## Dates to track

- Free plan credit expiry: 2027-05-12
- Free plan credits: $120
- **Before that date, switch the account to the Paid plan** (Billing and Cost Management →
  Account → Account plan). If you don't, the Free plan ends and the account is closed
  (ADR 0001). Set a calendar reminder for 2027-04-28.

## Baseline checklist (P0-04)

Only the owner can do the console steps. Order matters.

1. **Root MFA.** Sign in as the root user → account menu → Security credentials →
   Multi-factor authentication → Assign MFA device. Afterwards, never use root for daily work.
2. **Admin user.** IAM Identity Center → Enable (us-east-1) → Users → Add user → Permission
   sets (AdministratorAccess) → AWS accounts → assign the user to the account and the set →
   register MFA from the invite email.
3. **CLI profile `withinmeans`.** Run `aws configure sso` with the access portal URL, SSO
   region us-east-1 and profile name `withinmeans`. Sign in later with
   `aws sso login --profile withinmeans`.
4. **Budget.** Billing and Cost Management → Budgets → Create budget → Cost budget, monthly,
   $1, alert at 100% of actual cost to the owner's email.
5. **Credit expiry.** Billing and Cost Management → Free Tier: confirm the date above.
6. **CDK bootstrap.** Run `cdk bootstrap aws://<account>/us-east-1` once, using the
   `withinmeans` profile.

## Verify

```bash
export WITHINMEANS_AWS_ACCOUNT_ID=<12-digit account id>
aws sts get-caller-identity --profile withinmeans
pnpm exec vitest run --project tooling tooling/aws
```

The identity must be an assumed role (`AWSReservedSSO_AdministratorAccess…`), not root.

## Find it in the console

- **Free Tier:** Billing and Cost Management → Free Tier. Remaining credits and the end date.
- **Admin user and MFA:** IAM Identity Center → Users → your user → MFA devices. Root MFA:
  account menu → Security credentials.
- **Budget:** Billing and Cost Management → Budgets → the $1 budget and its alert.
- **CDKToolkit:** CloudFormation → Stacks → `CDKToolkit`, created by `cdk bootstrap`. It holds
  the S3 bucket, the ECR repository and the IAM roles that CDK deploys through. Never delete it.
