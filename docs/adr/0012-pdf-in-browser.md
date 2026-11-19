# 0012. Year in review PDF built in the browser

- **Status:** Accepted
- **Date:** 2026-11-19

## Context

Server-side PDF needs headless Chrome in Lambda for a once-a-year button.

## Decision

Build the PDF in the browser with `@react-pdf/renderer` from a tested content model.

## Consequences

No server code or data leaves the browser for the PDF.
