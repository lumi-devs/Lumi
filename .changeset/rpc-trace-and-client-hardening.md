---
"@lumi/contracts": patch
"@lumi/core": patch
---

Continue the caller's W3C trace in RPC dispatch with per-action spans, and harden the RPC client: retry any retryable coded failure (honoring retryAfterMs) and reject over-cap response bodies without buffering them.
