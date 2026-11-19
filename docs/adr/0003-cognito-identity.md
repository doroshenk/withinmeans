# 0003. Amazon Cognito for identity; households in our database

- **Status:** Accepted
- **Date:** 2026-11-19

## Context

The spec needs email/password, reset, "keep me signed in", invites and later passkeys.

## Decision

Cognito user pool (Essentials tier, Always Free to 10,000 monthly users) handles credentials, reset and tokens. Household, Membership, Invite and roles stay in our database. We build our own sign-in screens. `User.cognito_sub` replaces `password_hash`.

## Consequences

No password handling in our code. The API verifies tokens with `aws-jwt-verify` in the Lambda (no paid authorizer).
