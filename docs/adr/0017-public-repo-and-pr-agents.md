# 0017. Public repo, branch protection, and the PR agents

- **Status:** Accepted
- **Date:** 2026-11-19

## Context

The owner wants agents to review pull requests, merge them and keep branches up to date. On GitHub Free, protected branches and rulesets only work on public repositories, and an automatic merger without branch protection has no safety net.

## Decision

- Make `doroshenk/withinmeans` public. No data, keys or secrets ever live in the repo; the household's data lives only in AWS.
- Protect `main`: PR required, required CI checks, up-to-date branches, conversation resolution, merge commits only (so `test:` → `feat:` commits stay visible), no bypass for admins.
- **Review:** the Claude Code GitHub Action's review workflow on every PR, authenticated with the owner's Claude subscription token. A read-only `pr-reviewer` subagent for an optional local review before the PR.
- **Merge:** a `/merge-pr` skill that checks draft state, CI, unresolved threads, branch freshness and test-before-feat commit order, asks for confirmation, then merges with a merge commit. Never `--admin`.
- **Update:** a `/sync` skill: tidy `main` after merges, or rebase an open PR on GitHub's side with `gh pr update-branch --rebase`.
- Merge and update are skills, not autonomous agents: they are fixed checklists and stop to ask.

## Consequences

- GitHub Actions minutes are unlimited on standard runners; Claude reviews use the owner's subscription.
- Anyone can read the code and plan. Forks can open PRs, so outside contributors' workflow runs need approval, and the AWS deploy role trusts only `main` and `v*` tags.
