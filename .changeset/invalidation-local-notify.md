---
"@lumi/infrastructure": patch
"@lumi/core": patch
---

Notify local invalidation listeners synchronously inside `invalidate`, instead of only on the pub/sub loopback. A write followed by a re-read in the same tick (e.g. panel pick → re-render) previously saw the stale L1 entry and needed a manual refresh.
