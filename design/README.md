# Design snapshot

PNG exports of the Claude Design canvas, taken Nov 19, 2026: https://claude.ai/artifact/4XwwpcVFRAHrjU1kZ1jkd4

The canvas is the source of truth; these images are a pinned copy so every Claude Code session can look at the screens (`@design/Bills.png`). If the design changes, export the PNGs again from the canvas (Share → Export), rename them as below, and commit them in their own PR.

| File | Canvas artboard | Spec | Built in |
|---|---|---|---|
| `SignIn.png` | Sign in / create account | §3, §6.13 | P0-11, P1-02, P1-04, P1-05 |
| `Setup.png` | First-time setup | §3 setup wizard | P1-08 – P1-13, P2-07, P2-09, P3-01, P3-05 |
| `Main.png` | Yearly dashboard | §6.1 | P1-07 (shell), P4-02, P4-05 |
| `Bills.png` | Monthly bills & cash flow | §6.2 | P2-06, P2-07 |
| `Recurring.png` | Recurring bills | §6.3 | P2-08 |
| `Paychecks.png` | Paychecks & other income | §6.4 | P2-09 |
| `Accounts.png` | Accounts | §6.5 | P3-01, P4-03, P4-04 |
| `Income.png` | Investment income & money moves | §6.6 | P3-02, P3-03, P3-09 |
| `Settings.png` | Allocation settings | §6.7 | P3-05 |
| `StartMonth.png` | Start a new month | §6.8 | P4-06 |
| `QuickAdd.png` | Add anything | §6.9 | P2-10, P3-11 |
| `DataMap.png` | How the data connects | §6.10 (reference only, not built) | — |
| `YearEnd.png` | Year in review | §6.11 | P5-02, P5-03 |
| `EmptyStates.png` | Empty states | §6.14 | every screen ticket, P6-06 |
| `Phone.png` | Phone | §6.15 | P1-07, P6-01 – P6-05 |

The Reminders artboard is not included: reminders were removed from scope (§6.12).

Compare each built screen with its image at 1440px and 390px wide, and put the screenshots in the PR.
