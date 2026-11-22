# 0001. Host on AWS within Always Free services

- **Status:** Accepted
- **Date:** 2026-11-19

## Context

The site must stay on AWS's free tier. The account is on the Free plan ($120 credits, expiring 2027-11-12; the credits live in the organization's management account), which closes the account if not upgraded before it ends.

## Decision

Build only on Always Free services (Lambda, CloudFront, Cognito, Aurora DSQL, EventBridge Scheduler) in us-east-2. Use credits only as a buffer. Upgrade to the Paid plan with a $1 budget alert before the Free plan ends.

## Consequences

No RDS, NAT gateways, Secrets Manager or provisioned capacity. Small costs (S3, AWS Backup, SES, API Gateway) are cents. The upgrade date must be tracked in `docs/runbooks/aws-account.md`.

## Update (2026-11-20): region is us-east-2

The AWS account is a member of an AWS Organization whose service control policy denies most regions other than us-east-2 (for example, CloudFormation in us-east-1 returns an explicit deny). The project therefore uses **us-east-2 (Ohio)** instead of us-east-1.

Open risk: CloudFront needs its ACM certificate in us-east-1, which the policy denies. The custom domain ticket must resolve this (ask the organization's owner for a us-east-1 ACM exception, or serve from the default `cloudfront.net` domain) before it starts.
