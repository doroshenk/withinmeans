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
- CloudFront needs its ACM certificate in us-east-1. The SCP's `UsEast1Partitional` statement
  already allows `acm:*` and `cloudfront:*` there, but not CloudFormation, S3, SSM or ECR, so
  CDK can't deploy to us-east-1. The certificates are therefore created by hand in the ACM
  console (see the website section below).
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

- **Defined in:** `packages/infra/src/web-stack.ts` (`WebStack-<stage>`, us-east-2). The certificate is the one thing in us-east-1: switch the console region selector to N. Virginia to see it.
- **The certificate is not in CDK.** CloudFront only accepts a certificate from us-east-1, and the
  SCP blocks CloudFormation there (see Region above). You create it by hand once per stage and
  give `WebStack` its ARN.

### Steps (once per stage; do dev first)

Use the IAM user `withinmeans-admin` in the Within Means account, never root.

1. **Check access:** `aws acm list-certificates --region us-east-1` with the `withinmeans`
   profile returns an empty list (not an access error).
2. **Request the certificate:** console → Certificate Manager → region **US East (N. Virginia)
   us-east-1** → Request → Request a public certificate → domain `dev.within.doroshenk.com`
   (prod: `within.doroshenk.com`) → DNS validation → RSA 2048 → Request.
3. **Validate:** open the certificate; under Domains copy the CNAME name and value into
   Network Solutions (if the form appends `.doroshenk.com`, enter the host without it, e.g.
   `_abc123.dev.within`). The status goes from Pending validation to Issued (minutes).
4. **Copy the certificate ARN** from the certificate's detail page. It contains the account ID:
   keep it in your shell, never in the repo.
5. **Deploy the website:**
   `pnpm --filter @withinmeans/infra exec cdk deploy ApiStack-dev WebStack-dev --context stage=dev --context certificateArn=<arn>`.
   It prints `SiteDomain`, `DistributionDomain` and `BucketName` (also under CloudFormation →
   the stack → Outputs, region us-east-2). CloudFront takes 5 to 15 minutes to create.
6. **Point the name at CloudFront:** at Network Solutions add CNAME `dev.within` →
   `<DistributionDomain>` (prod: `within` → its distribution domain).
7. **Check:** `https://dev.within.doroshenk.com` shows a valid certificate. Until the web app is
   uploaded (a later ticket) the page is an S3 "Access Denied" XML error. Any `/api/...` path
   answers from the API instead.

Without `--context certificateArn`, synth uses a placeholder ARN so CI can check the template;
a real deploy with it fails.

### Gotchas

- **Network Solutions wildcard A record.** The domain came with a wildcard `*` A record
  (168.62.198.235, a parking server). It answered IPv4 lookups for the new names, so browsers
  got `ERR_CONNECTION_RESET` even though the CNAMEs were right. Delete it. Network Solutions
  syncs its nameservers slowly (DNS TTL 3600): check with
  `nslookup -type=A some-random-name.doroshenk.com ns56.worldnic.com` (no answer means gone).
- The GitHub deploy role can assume only the us-east-2 CDK bootstrap roles, which suits
  `WebStack` and `ApiStack`.
- The dev bucket is removed with its stack, but S3 refuses to delete a non-empty bucket: empty it
  first (S3 → the bucket → Empty). The prod bucket is always kept.
- Paths without a file extension load the app through a CloudFront Function on the default
  behavior only, so `/api/*` errors stay JSON.

### Find it in the console

- **Certificate Manager (us-east-1):** the certificate, Pending validation → Issued.
- **CloudFront → Distributions:** the distribution. Origins tab: the bucket (with Origin
  access control) and the API host. Behaviors tab: `/api/*` (caching disabled, all viewer
  headers except Host forwarded, so Authorization reaches the API) and Default (`*`, the bucket).
  Function associations on the default behavior: the SPA rewrite function.
- **S3 → Buckets:** the `WebStack-<stage>` bucket → Permissions: "Block all public access" is
  on, and the bucket policy allows only that distribution.
