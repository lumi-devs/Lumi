# @lumi/application

## 1.0.0

### Major Changes

- [`e1238f6`](https://github.com/lumi-devs/Lumi/commit/e1238f6608bf4b648b9a21dc8c05226ae8811b1e) - Remove Sapphire runtime: plain discord.js `Client`, own module/utility registries, own services container. No backward compatibility, no shims.

### Patch Changes

- [`edfe1a7`](https://github.com/lumi-devs/Lumi/commit/edfe1a76d38f6083fad667d2568f18ce1a7775c7) - Remove Sapphire-carcass APIs with no aliases: addon SDK is plain `defineModule`/`defineCommand` data (deleted `DefineModule`/`Module`/`BaseCommand`/`BaseSubcommand`/`CommandRegistry`/`captureBuilder`), single `ScheduledTasks` source of truth, one reply stack (`ctx.reply*`), fail-closed unknown gates, deleted dead infra services (`BaseRepository`, `CacheService`, `InfrastructureDatabaseService`, outbox, queue-service barrel), `prisma/errors` inlined at the RPC boundary, `repositoryCache` co-located with `CacheStore`, explicit Valkey publishers, global `lock.ts` shim removed. Deleted the dead `permission` RPC option.
- Updated dependencies [[`edfe1a7`](https://github.com/lumi-devs/Lumi/commit/edfe1a76d38f6083fad667d2568f18ce1a7775c7), [`273ff04`](https://github.com/lumi-devs/Lumi/commit/273ff045cb269aae9ee6b0038fe6d30ce76cf4b4)]:
  - @lumi/infrastructure@0.6.1
  - @lumi/contracts@0.8.0
