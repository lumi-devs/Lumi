---
"@lumi/sharding": patch
---

Fix a stale-read window in `RedisSessionStore`: `retrieve()` could read Redis directly while a `flush()` for the same shard was still mid-flight, returning stale or absent data instead of the value already snapshotted for write. Concurrent `flush()` calls are also now serialized instead of racing overlapping snapshots.
