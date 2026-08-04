---
"@lumi/event-bus": patch
"@lumi/core": patch
---

Fix broadcast consumer groups replaying the full stream backlog on every restart (groups now start from `$` for broadcast subscriptions instead of `0`), stop acking a message when its DLQ write fails (so a dead-letter failure no longer silently loses the message), and guard `runClaim`'s `pendingDeliveryCount` call with try/catch so a transient Redis error doesn't kill the claim loop.
