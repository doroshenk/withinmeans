
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
- **Stack outputs are imported across stacks.** `ApiStack` imports from `DataStack`, and `WebStack` from
  `ApiStack`, so a stack can't be deleted (or its exported cluster/API value replaced) while the next one
  uses it. Delete in the order Web, Api, Data. A backup vault must be emptied of recovery points before
  its stack can be deleted.
- **Deleting the cluster behind a stack leaves the stack unable to update** (CloudFormation reads the
  missing cluster and fails). After a restore drill, delete the *restored* cluster, never the original.
