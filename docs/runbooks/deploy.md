
## Hardening notes

- **Restrict who can create `v*` tags** (Settings → Rules → Rulesets → New tag ruleset, target `v*`,
  restrict creations to yourself). The "tag is on main" check lives in the tagged commit's own
  workflow file, so a collaborator could tag a branch that removes it; the ruleset closes that.
- The deploy role is shared by dev and prod, so anything running on `main` can assume it, and it can now
  connect to prod's database. The prod-migrate guard stops laptop accidents, not a malicious workflow.
  Fine for one owner; a separate prod role trusted only on tags is the later upgrade.
- Between the API deploy and the migration, new API code briefly runs on the old schema; the
  two-release migration rule (add → backfill → switch → drop) is what makes that safe.

## Gotchas

- **Recreating a website stack: remove its CNAME first.** CloudFront refuses to create a distribution for
  `dev.within.doroshenk.com` while that name's CNAME points at another (even deleted) distribution
  ("incorrectly configured DNS record that points to another CloudFront distribution"). Delete the CNAME
  at Network Solutions, deploy, then add the CNAME for the new `DistributionDomain`. The site is down in between.
- **Stack outputs are imported across stacks.** `ApiStack` and `JobsStack` import from `DataStack`, and
  `WebStack` from `ApiStack`, so a stack can't be deleted (or its exported cluster/API value replaced) while
  another uses it. Delete in the order Web, Api, Jobs, Data. A backup vault must be emptied of recovery
  points before its stack can be deleted, and the export bucket (all versions) before `JobsStack`.
- **Deleting the cluster behind a stack leaves the stack unable to update** (CloudFormation reads the
  missing cluster and fails). After a restore drill, delete the *restored* cluster, never the original.
- **Read the prod diff before tagging** (you run it, never deploy from a laptop):
  `pnpm --filter @withinmeans/infra exec cdk diff --context stage=prod --context certificateArn=<prod cert ARN>`.
  A prod stack created before a ticket added resources shows those as `[+]` the first time (for example
  the backup vault, plan and role in `DataStack-prod` after P0-12). That is expected. Stop only for
  `[-]` or "replace" on the cluster, the user pool, the bucket or the distribution. If CDK says it
  "Could not create a change set" it falls back to a template diff, which is less exact about
  replacements; re-run with `-v` to see why. An existing distribution is not replaced, so its
  `DistributionDomain` and your `within` CNAME stay the same.
