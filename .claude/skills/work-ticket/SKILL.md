---
name: work-ticket
description: Work one Within Means ticket end to end, test-first, from plan to pull request.
argument-hint: [ticket-id-or-issue-number]
disable-model-invocation: true
allowed-tools: Bash(gh issue view *) Bash(gh issue list *) Bash(git status) Bash(git diff *) Bash(git log *) Bash(pnpm test *) Bash(pnpm lint) Bash(pnpm typecheck)
---

Work ticket $ARGUMENTS for Within Means.

1. **Find the ticket.** If the argument looks like `P2-06`, run `gh issue list --search "[P2-06] in:title" --state all` to find its issue; otherwise treat it as an issue number. Read it with `gh issue view <n>`. If a ticket in its "Blocked by" line is still open, stop and tell me which one.
2. **Read the context.** `CLAUDE.md`, the spec sections the ticket cites in `docs/SPEC.md`, the ticket's section in `docs/PLAN.md`, any decision record in `docs/adr/` it touches, and the `design/` artboard for any screen it builds.
3. **Branch.** Create a branch named after the ticket, e.g. `p2-06-bills-page`, from an up-to-date `main`.
4. **Plan.** Write a short plan: the files you'll add or change, the tests you'll write (one per "tests to write first" item, named after it, plus any extra edge cases), and any question the spec doesn't answer. Wait for my approval.
5. **Red.** Write the tests. Run them and show me that they fail for the right reason (not a syntax or import error). Commit: `test(<ticket-id>): …`.
6. **Green.** Implement the smallest change that makes them pass. Run `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm coverage`. Commit: `feat(<ticket-id>): …`. Refactor if useful, keeping tests green: `refactor(<ticket-id>): …`.
7. **Check.** Go through every checkbox in the ticket and the Definition of done in `docs/PLAN.md` §9. For screens, start `pnpm dev` and remind me to compare with the artboard at 1440px and 390px. For infra, list the console checklist items and explain what each resource is.
8. **PR.** Offer to run the `pr-reviewer` subagent first. Then push the branch and open a PR with `gh pr create`, using the PR template. Link the issue with `Closes #<n>`. Tell me what to look at first, and that the next steps are: read the Claude review on GitHub, address or answer each comment, resolve the threads, then `/merge-pr <pr-number>`.

Never weaken or skip a test to get to green. If you're stuck after two attempts at the same failure, stop and explain what you've tried.
