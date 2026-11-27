# Release runbook

How a version reaches prod. Prod holds real data from `v0.2.0` (ADR 0016), so every release from
here on follows this page. Pushing a `v*` tag is the approval to deploy (ADR 0006). Nobody runs
`cdk deploy` or `pnpm migrate` against prod from a laptop.

## What the pipeline does

Pushing the tag runs **Deploy prod** (`.github/workflows/deploy-prod.yml`), which refuses a tag
that is not on `main` and then runs these steps in order:

1. Deploys the email, sign-in, database, API and scheduled-job stacks.
2. Builds the web app and deploys the website.
3. Takes an on-demand AWS Backup of the prod database (`scripts/backup-now.sh prod`) and waits
   for it to complete.
4. Runs the database migrations.
5. Checks that the site loads and shows the sign-in form.

A step that fails stops the ones after it, so **no migration runs without a completed backup**.

## Before tagging

- [ ] Every ticket of the phase is merged, and its acceptance tests pass.
- [ ] On the commit you will tag, **CI**, **Deploy dev** and **DSQL conformance** are green
      (`gh run list --branch main`). A cancelled run is not green.
- [ ] The change has been tried on `dev.within.doroshenk.com`, signed in, at desktop and phone
      width.
- [ ] Migrations since the last release are listed
      (`git diff --name-only <last tag> origin/main -- packages/db/migrations`) and follow the
      rules below.
- [ ] You have read the prod diff (sign in with the `withinmeans` profile first):
      `AWS_PROFILE=withinmeans pnpm --filter @withinmeans/infra exec cdk diff --context stage=prod --context certificateArn=<prod cert ARN>`.
      Stop on `[-]` or "replace" for the database cluster, the user pool, a bucket or the
      distribution (see [deploy.md](deploy.md)).
- [ ] The newest daily recovery point in the prod backup vault is less than a day old.
- [ ] A GitHub tag ruleset restricts creating `v*` tags to you (see [deploy.md](deploy.md)).

## Release

```bash
git switch main
git pull --ff-only
git log -1 --oneline            # the commit you checked above
git tag v0.2.0                  # the next version
git push origin v0.2.0          # push this one tag; it starts "Deploy prod"
gh run list --workflow "Deploy prod" --limit 1
gh run watch <run id>
```

## After the release

- [ ] **Deploy prod** is green, including the backup and the smoke test.
- [ ] The migration step's log lists the migrations you expected.
- [ ] Sign in on `within.doroshenk.com` and open each screen.
- [ ] **Download my data** on the Dashboard screen produces a file. Keep it somewhere private.

## If the backup fails

The run stops before the migrations, so the database is unchanged. The new API and website are
**already live** on the old database, and screens that need a new table will fail until the
migrations run.

1. Read the step's log for the job ID, then AWS Backup → Jobs → Backup jobs for the reason.
2. Fix the cause, then re-run the failed job (`gh run rerun <run id> --failed`). It deploys the
   same tag again and takes a new backup.
3. Never skip the backup step, edit the script to ignore the state, or migrate by hand.

## If a migration fails

Each schema change runs on its own, so the ones before the failure stay applied. A re-run skips
the migrations recorded as finished and runs the failed file again from its first statement.

1. Read the step's log. Do not edit a merged migration, and do not change the database by hand.
2. A passing problem (a timeout, a concurrency conflict): re-run the failed job.
3. A real bug: fix it on `main` through a pull request and release the next patch version
   (`v0.2.1`). A migration that already ran in prod is corrected by a **new** migration. If the
   broken one can never succeed, so that it blocks every later one, stop and decide how to fix
   it before changing any file.
4. Data damaged: restore into a new cluster from the recovery point taken just before the
   migration, following [restore.md](restore.md). Never restore over the live cluster.

## Migration rules from v0.2.0

- Migrations are **forward-only**. A merged migration is never edited, renamed or removed.
- Each migration is DDL only or DML only, and passes the DSQL migration linter.
- Write schema changes so that they can run again (`IF NOT EXISTS`).
- A breaking change takes two releases: **add → backfill → switch → drop**. The first release
  adds the new shape, fills it and switches the code; a later one drops the old shape.
- The new API runs on the old schema for a few minutes during every deploy, and for longer if the
  backup or a migration fails.
- There is no rolling back the database. Rolling back code means releasing a fix.

## First release with real data (v0.2.0)

Prod has had only `v0.0.1`, so this release applies every migration since then.

- [ ] SES: your address and your partner's are verified
      (see [aws-account.md](aws-account.md), Email), or the invite cannot be sent.
- [ ] After the release, sign up on `within.doroshenk.com` and pick your first month.
- [ ] Work through setup: bank accounts and cushion, paychecks, bill categories, recurring bills
      and credit cards. Investments and income splits show "coming soon" until `v0.3.0`.
- [ ] Invite your partner, if you are two.
- [ ] Enter nicknames only: never a card or account number.

## The side-by-side month

Run the site and your Google Sheet together for one full calendar month, starting with the first
month you enter in prod.

1. Import [side-by-side.csv](side-by-side.csv) into a **private** Google Sheet (File → Import),
   one tab per week. This repo is public: never commit a filled-in copy, a screenshot with real
   figures or an export of your data.
2. Once a week, fill in **Site** and **Google Sheet** on the same day, then **Difference**.
3. Explain every difference (ADR 0016). A timing difference or a mistake in the Sheet is fine
   once written down. Anything else is a bug: open an issue that describes it with made-up
   figures.
4. Until `v0.3.0` the site has no investment income, so leave it out of the Sheet's figures too.
5. The month passes when its last week has no unexplained difference and no open bug about a
   wrong figure.

## Find it in the console (region us-east-2)

- **CloudFormation → Stacks:** the `-prod` stacks; the Events tab shows what a deploy changed.
- **AWS Backup → Jobs → Backup jobs:** the on-demand job the deploy started, and its state.
- **AWS Backup → Vaults:** the vault named by the `BackupVaultName` output of `DataStack-prod`.
- **Aurora DSQL → Clusters:** the prod database. Deletion protection stays on.
- **CloudWatch → Log groups:** the prod API's logs, if a screen fails after a release.
