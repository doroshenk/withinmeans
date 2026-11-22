---
name: merge-pr
description: Merge a Within Means pull request only after every merge check passes, then sync main.
argument-hint: [pr-number]
disable-model-invocation: true
allowed-tools: Bash(gh pr view *) Bash(gh pr checks *) Bash(gh api graphql *) Bash(gh pr merge * --merge --delete-branch) Bash(git switch main) Bash(git pull --ff-only) Bash(git fetch --prune)
---

Merge pull request $ARGUMENTS for Within Means. If no number was given, use the PR for the current branch (`gh pr view --json number`).

Go through every check below. **If any check fails, stop, tell me which one and why, and do not merge.** Never work around a failed check: don't resolve review threads yourself, don't re-run or skip CI to get a pass, and never use `--admin`, `--squash` or `--rebase`. This repo merges with a merge commit so the `test:` → `feat:` commits stay visible.

1. **Open and ready.** `gh pr view <n> --json state,isDraft,baseRefName,mergeStateStatus,headRefName`. It must be `OPEN`, not a draft, and target `main`.
2. **Up to date, no conflicts.** If `mergeStateStatus` is `BEHIND`, stop and tell me to run `/sync <n>` first. If it is `DIRTY` (merge conflicts) or anything other than `CLEAN`, stop and tell me why.
3. **CI green.** `gh pr checks <n>`: every check must pass. Pending counts as not passed: tell me to wait. The Claude review job must have finished.
4. **Review addressed.** List unresolved review threads:
   `gh api graphql -f query='query($o:String!,$r:String!,$n:Int!){repository(owner:$o,name:$r){pullRequest(number:$n){reviewThreads(first:100){nodes{isResolved path comments(first:1){nodes{author{login} body}}}}}}}' -F o=doroshenk -F r=withinmeans -F n=<n>`
   Any thread with `isResolved: false` blocks the merge. Show me each one (file and first line of the comment). Resolving threads is my call, not yours.
5. **Tests came first.** `gh pr view <n> --json commits --jq '.commits[].messageHeadline'`: a `test(` or `test:` commit must come before the first `feat(` or `feat:` commit. A PR with no `feat` commit (docs, chores) passes. Fixes must start with a `test` commit too.
6. **Summary.** Show me a one-screen summary: title, the checks above as ✓, and the commit list. Do not ask for confirmation: running `/merge-pr` is the confirmation.
7. **Merge** as soon as checks 1–5 all pass (no conflicts, CI green, no unresolved threads, tests first): `gh pr merge <n> --merge --delete-branch`. If any check failed you already stopped at that check.
8. **Sync.** `git switch main`, `git pull --ff-only`, `git fetch --prune`. Then tell me which ticket this closed and what's next: list open issues whose "Blocked by" tickets are now all closed (`gh issue list --state open --json number,title,body`).
