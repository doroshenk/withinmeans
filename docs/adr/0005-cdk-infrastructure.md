# 0005. AWS CDK in TypeScript, with console walk-throughs

- **Status:** Accepted
- **Date:** 2026-11-19

## Context

The owner is new to AWS and wants to learn it, but also wants repeatable infrastructure.

## Decision

All infrastructure is AWS CDK (TypeScript) in `packages/infra`, with assertion tests. Each infra ticket ends with a checklist of where to find its resources in the AWS console.

## Consequences

Infrastructure is reviewable and testable. Manual console changes are not allowed (they'd drift).
