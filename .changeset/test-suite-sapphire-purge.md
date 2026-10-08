---
"@lumi/core": patch
---

Purge Sapphire-era test doubles and break the services/DatabaseService/repository import cycle: delete obsolete class-based command/listener/store tests, drop dead `container.stores` mocks, move the shared `repositoryCache` next to `CacheStore`, resolve services lazily in the repository base.
