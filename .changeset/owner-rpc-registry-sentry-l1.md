---
"@lumi/core": minor
"@lumi/observability": minor
---

Owner-based RPC registry: module unload prunes that owner's handlers and load restores them, plus `registerDynamicRpc`/`unregisterDynamicRpc` for runtime owners. Optional Sentry error reporting behind `SENTRY_DSN` with flush on shutdown. Repository L1 cache now attaches in the shared container root so the api and scheduler processes get invalidation too.
