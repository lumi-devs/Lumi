---
"@lumi/core": patch
---

Route `guildSettingsSet`'s writes through the per-guild write transaction instead of calling the repository directly, and close a cache-aside race in `Repository.getOrSet` where a concurrent invalidation could be clobbered by a stale repopulation (via a per-key fence marker checked before and after the underlying fetch).
