---
"@lumi/core": patch
---

Fixed pre-existing test infrastructure debt: moderation and AFK test suites never mocked `container.invalidation` (or asserted the removed `container.redis.del` fallback), left over from the phase 3 & 3.5 module restructuring that made `container.invalidation.invalidate()` the sole cache-invalidation path. No production behavior changes.
