# 0014. Daily AWS Backup plus nightly JSON export

- **Status:** Accepted
- **Date:** 2026-11-19

## Context

The spec requires daily backups and a JSON export.

## Decision

AWS Backup takes daily DSQL recovery points (14 days) plus one before every prod migration. A nightly Lambda writes each household's JSON export to a private, versioned S3 bucket (90 days). A restore drill is done once and written up.

## Consequences

A few cents a month. Every new table must be in the export (test-enforced).
