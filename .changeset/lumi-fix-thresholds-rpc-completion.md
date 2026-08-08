---
"@lumi/core": patch
"@lumi/contracts": patch
"@lumi/sharding": patch
---

Fixes the dashboard RPC surface (moderation cases, warn thresholds, config overrides, blocklist, AFK/ignored-channel lists, module data, audit log, config history) that referenced `@lumi/contracts` types and repository methods that were never actually committed — the dashboard module failed to load at runtime (`Cannot read properties of undefined (reading 'map')`) because `WARN_THRESHOLD_ACTIONS` and related payload types didn't exist on this branch. Also completes the `@lumi/sharding` cluster-telemetry exports (`DEFAULT_CLUSTER_NAME`, `readClusterShards`) the RPC layer depends on for the shard-status panel.
