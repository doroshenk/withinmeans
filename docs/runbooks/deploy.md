
## Hardening notes

- **Restrict who can create `v*` tags** (Settings → Rules → Rulesets → New tag ruleset, target `v*`,
  restrict creations to yourself). The "tag is on main" check lives in the tagged commit's own
  workflow file, so a collaborator could tag a branch that removes it; the ruleset closes that.
- The deploy role is shared by dev and prod, so anything running on `main` can assume it, and it can now
  connect to prod's database. The prod-migrate guard stops laptop accidents, not a malicious workflow.
  Fine for one owner; a separate prod role trusted only on tags is the later upgrade.
- Between the API deploy and the migration, new API code briefly runs on the old schema; the
  two-release migration rule (add → backfill → switch → drop) is what makes that safe.
