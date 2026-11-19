# 0011. No reminders or notifications

- **Status:** Accepted
- **Date:** 2026-11-19

## Context

The spec had 10 reminder rules with push, email and a digest. The owner decided he won't need them.

## Decision

Remove reminders entirely: no push, no reminder emails, no digest, no settings, no scheduler for them. Keep the dashboard's This week list, computed on page load by the pure `dueSoon()` function.

## Consequences

No web push, VAPID keys or notification tables. The PWA is still installable.
