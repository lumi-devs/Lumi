---
"@lumi/core": major
"@lumi/application": patch
"@lumi/infrastructure": patch
"@lumi/contracts": patch
---

Remove Sapphire-carcass APIs with no aliases: addon SDK is plain `defineModule`/`defineCommand` data (deleted `DefineModule`/`Module`/`BaseCommand`/`BaseSubcommand`/`CommandRegistry`/`captureBuilder`), single `ScheduledTasks` source of truth, one reply stack (`ctx.reply*`), fail-closed unknown gates, deleted dead infra services (`BaseRepository`, `CacheService`, `InfrastructureDatabaseService`, outbox, queue-service barrel), `prisma/errors` inlined at the RPC boundary, `repositoryCache` co-located with `CacheStore`, explicit Valkey publishers, global `lock.ts` shim removed. Deleted the dead `permission` RPC option.
