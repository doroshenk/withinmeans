# 0008. within.doroshenk.com via CNAME; SES on the subdomain

- **Status:** Accepted
- **Date:** 2026-11-19

## Context

The owner has `doroshenk.com` at Network Solutions with Gmail on the root domain.

## Decision

Prod at `within.doroshenk.com`, dev at `dev.within.doroshenk.com`, via CNAMEs to CloudFront and a free ACM certificate. No Route 53. SES sends invites from `no-reply@within.doroshenk.com` with DKIM and DMARC on the subdomain; sandbox mode with both addresses verified. `/api/*` goes through the same CloudFront distribution.

## Consequences

About 7 DNS records are added by hand once. Root-domain mail records are never touched.
