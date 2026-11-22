---
name: sync
description: Bring a Within Means branch up to date - main after a merge, or an open PR that has fallen behind main.
argument-hint: [pr-number]
disable-model-invocation: true
allowed-tools: Bash(git status*) Bash(git fetch --prune) Bash(git switch *) Bash(git pull --ff-only) Bash(git pull --rebase) Bash(git branch -vv) Bash(git branch -d *) Bash(git log *) Bash(gh pr view *) Bash(gh pr update-branch * --rebase) Bash(pnpm test*)
---

Sync the Within Means working copy. Argument: $ARGUMENTS (a PR number, or nothing).

**First, always:** `git status`. If there are uncommitted changes, stop and ask me whether to commit them, stash them or leave them. Never discard them.

**A. No PR number, or I'm on `main`: tidy up after merges.**

1. `git switch main`, then `git pull --ff-only` and `git fetch --prune`.
2. `git branch -vv`: for each local branch whose upstream shows `: gone]` (merged and deleted on GitHub), delete it with `git branch -d <name>`. If `-d` refuses because the branch isn't merged, leave it and tell me. Never use `-D`.
3. Report the latest commit on `main` and the branches you removed.

**B. A PR number: update an open PR that's behind `main`.**

1. `gh pr view <n> --json headRefName,mergeStateStatus`. If it isn't `BEHIND`, say it's already up to date and stop.
2. Rebase it on GitHub's side: `gh pr update-branch <n> --rebase`. This avoids a force-push from here.
3. Locally: `git switch <headRefName>`, then `git pull --rebase`.
4. If there's a conflict, stop. Show me the conflicting files and what each side changed, and work through it with me. Never pick a side silently.
5. Run `pnpm test`. The PR's CI runs again on GitHub after the update; remind me to wait for it before `/merge-pr <n>`.
