---
"@lumi/core": minor
---

Heat-based escalation for the `filter` module. Each member accrues a decaying
"heat" score from spam signals (per message, per mention, repeated messages, and
hard filter hits); as heat crosses configurable thresholds the member is warned,
timed out, then quarantined. Heat decays linearly on read via a self-expiring
Redis key (no cron), and per-guild heat config is cached in memory alongside the
compiled rules so the hot message path adds no extra config reads.
