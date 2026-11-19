# 0001. Host on AWS within Always Free services

- **Status:** Accepted
- **Date:** 2026-11-19

## Context

The site must stay on AWS's free tier. The account is on the Free plan ($200 credits), which ends after 6 months and closes the account if not upgraded.

## Decision

Build only on Always Free services (Lambda, CloudFront, Cognito, Aurora DSQL, EventBridge Scheduler) in us-east-1. Use credits only as a buffer. Upgrade to the Paid plan with a $1 budget alert before the Free plan ends.

## Consequences

No RDS, NAT gateways, Secrets Manager or provisioned capacity. Small costs (S3, AWS Backup, SES, API Gateway) are cents. The upgrade date must be tracked in `docs/runbooks/aws-account.md`.
