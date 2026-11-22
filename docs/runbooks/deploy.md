# Deploy runbook (P0-13)

Merging to `main` deploys **dev**. Pushing a `v*` tag deploys **prod**. Nothing else deploys.
This repo is public: never write account IDs, certificate ARNs, emails or passwords here.

## What each workflow does

| Workflow | Trigger | Does |
| --- | --- | --- |
| `deploy-dev.yml` | push to `main` | calls `deploy.yml` with `stage: dev` |
| `deploy-prod.yml` | push of a `v*` tag | checks the tag is on `main`, then calls `deploy.yml` with `stage: prod` |
| `deploy.yml` | called by the two above | deploy auth/database/API, build web, deploy website, backup (prod only), migrate, smoke test |
| `conformance.yml` | push to `main` | repository suite on the real dev DSQL cluster (runs alongside the dev deploy) |

Order inside `deploy.yml`: **backup** (prod) → `AuthStack`, `DataStack`, `ApiStack` → web build (needs the
Cognito IDs from `AuthStack`) → `WebStack` (uploads the build to S3 and clears CloudFront) →
`pnpm migrate --stage <stage>` → Playwright smoke test.

Dev smoke test: signs in as the dev test user and expects "Hello". Prod smoke test: checks the sign-in
form loads (there is no test user in prod).

## One-time setup (you do these; Claude can't)

1. **Certificates.** Both exist already for dev; create the prod one the same way as the website
   runbook (`aws-account.md`, "Website") for `within.doroshenk.com`, in us-east-1.
2. **GitHub variables** (Settings → Secrets and variables → Actions → **Variables**):
   `DEV_CERTIFICATE_ARN` and `PROD_CERTIFICATE_ARN` (the ARNs from ACM). `AWS_DEPLOY_ROLE_ARN` is already there.
3. **Redeploy the dev data stack by hand once**, with the admin profile, so the deploy role gets its new
   backup permissions: `AWS_PROFILE=withinmeans pnpm --filter @withinmeans/infra exec cdk deploy DataStack-dev --context stage=dev`.
   (Prod needs nothing by hand: the tag workflow creates it, permissions included.)
4. **Dev test user** (Cognito → User pools → the dev pool → Users → Create user, or the CLI):
   ```
   aws cognito-idp admin-create-user --user-pool-id <dev pool id> --username <email> \
     --message-action SUPPRESS --profile withinmeans --region us-east-2
   aws cognito-idp admin-set-user-password --user-pool-id <dev pool id> --username <email> \
     --password '<strong password>' --permanent --profile withinmeans --region us-east-2
   ```
   Use an address you control but never commit it.
5. **GitHub secrets** (same page, **Secrets**): `SMOKE_EMAIL`, `SMOKE_PASSWORD` for that user.
6. **Point DNS** for `within.doroshenk.com` at the prod CloudFront domain (website runbook, step 6).

## Releasing v0.0.1

1. Merge the P0-13 PR. Wait for the dev deploy to go green (Actions → "Deploy dev").
2. `git checkout main && git pull && git tag v0.0.1 && git push origin v0.0.1`
3. Actions → "Deploy prod". Then open `https://within.doroshenk.com` and sign in with your own account.
   Sign-up is not built yet (P1-05): create your user in Cognito (Users → Create user) first.

## Find it in the console

- **GitHub:** Actions tab: one run per merge or tag; the failing step's log; failed smoke runs attach `playwright-traces`.
- **CloudFormation (us-east-2):** the stacks `AuthStack-*`, `DataStack-*`, `ApiStack-*`, `WebStack-*`.
- **S3:** the `WebStack-<stage>` bucket holds the uploaded web files (`index.html`, `assets/`).
- **Lambda:** a `Custom::CDKBucketDeployment` function (in the WebStack) copies files into the bucket and
  asks CloudFront to invalidate `/*`; **CloudFront → Invalidations** shows each one.
- **AWS Backup → Backup vaults:** the prod on-demand recovery point taken before each prod deploy.
- **IAM → Roles → `withinmeans-github-deploy`:** now also allowed to connect to each stage's database,
  start a backup in that stage's vault, and pass only the backup role to AWS Backup.

## If a deploy fails

- Failed before migrations: nothing in the database changed. Fix and re-push (dev) or delete and re-push the tag (prod).
- Failed during or after migrations on prod: restore from the recovery point taken at the start (`restore.md`).
- Never run `cdk deploy` against prod from a laptop.
