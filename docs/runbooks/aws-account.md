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

- **Subject format:** this repo has `use_immutable_subject` on, so GitHub tokens carry numeric
  IDs: `repo:doroshenk@<owner-id>/withinmeans@<repo-id>:ref:refs/heads/main`. The IDs are public
  (`gh api repos/doroshenk/withinmeans --jq '.owner.id, .id'`). A trust policy written with the
  plain `repo:owner/name` form never matches and fails with "Not authorized to perform
  sts:AssumeRoleWithWebIdentity".
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

## Website: S3, CloudFront and the domain (P0-10)

The web app is a set of files in a **private S3 bucket**. **CloudFront** (a content delivery
network) serves them over HTTPS at `within.doroshenk.com` (prod) and `dev.within.doroshenk.com`
(dev) and forwards `/api/*` to the HTTP API. There is no Route 53: DNS lives at Network Solutions.

- **Defined in:** `packages/infra/src/web-stack.ts` (`WebStack-<stage>`, us-east-2) and
  `certificate-stack.ts` (`CertificateStack-<stage>`, **us-east-1**).
- **Why two regions:** CloudFront only accepts a certificate created in us-east-1, and the SCP
  denies that region, so first ask for an exception (below).

### Steps (owner, once per stage; do dev first)

1. **SCP exception.** In the management account (Organizations → Policies → Service control
   policies) allow us-east-1 for at least `acm:*`, `cloudformation:*` and `ssm:*`/`s3:*`/`iam:*`
   for the CDK bootstrap. Allowing us-east-1 for everything is simplest.
2. **Bootstrap us-east-1:** `cdk bootstrap aws://<account>/us-east-1` with the `withinmeans` profile.
3. **Deploy the certificate:**
   `pnpm --filter @withinmeans/infra exec cdk deploy CertificateStack-dev --context stage=dev`.
   It will sit at "CREATE_IN_PROGRESS" waiting for DNS validation.
4. **While it waits:** Certificate Manager (region us-east-1) → the certificate → "Domains"
   shows a CNAME name and value. Add that CNAME at Network Solutions (drop `.doroshenk.com`
   from the name if the form appends it). The status goes from Pending validation to Issued
   (minutes). The stack finishes and prints `CertificateArn`.
5. **Deploy the website**, passing the ARN:
   `pnpm --filter @withinmeans/infra exec cdk deploy ApiStack-dev WebStack-dev --context stage=dev --context certificateArn=<arn>`.
   It prints `SiteDomain` and `DistributionDomain`.
6. **Point the name at CloudFront:** at Network Solutions add CNAME `dev.within` →
   `<DistributionDomain>` (for prod: `within` → its distribution domain).
7. **Check:** open `https://dev.within.doroshenk.com` (and prod). An empty bucket answers with
   the SPA fallback (an error page from S3 until the web app is uploaded in a later ticket), but
   the certificate must be valid. `https://<domain>/api/health` reaches the API.

Without `--context certificateArn`, synth uses a placeholder ARN so CI can check the template;
a real deploy with it fails.

### Find it in the console

- **Certificate Manager (us-east-1):** the certificate, Pending validation → Issued.
- **CloudFront → Distributions:** the distribution. Origins tab: the bucket (with Origin
  access control) and the API host. Behaviors tab: `/api/*` (caching disabled, all viewer
  headers except Host forwarded, so Authorization reaches the API) and Default (`*`, the bucket).
  Error pages tab: 403/404 return `/index.html`.
- **S3 → Buckets:** the `WebStack-<stage>` bucket → Permissions: "Block all public access" is
  on, and the bucket policy allows only that distribution.
