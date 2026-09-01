---
"@lumi/core": patch
---

Deduplicated guild config validation and cache-invalidation logic. Added `validateModuleConfigValue` to the module config-schema helpers and switched `ConfigUtility.setConfig` to use it instead of an inline duplicate of the same `schema.shape[key].parse()` check. Extracted the repeated per-module Redis invalidation key pair out of `ConfigRepository`'s four mutating methods into a single private helper. No behavior changes.
