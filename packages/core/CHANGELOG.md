# @lumi/core

## 1.0.0

### Major Changes

- [`e1238f6`](https://github.com/lumi-devs/Lumi/commit/e1238f6608bf4b648b9a21dc8c05226ae8811b1e) - Remove Sapphire runtime: plain discord.js `Client`, own module/utility registries, own services container. No backward compatibility, no shims.

- [`edfe1a7`](https://github.com/lumi-devs/Lumi/commit/edfe1a76d38f6083fad667d2568f18ce1a7775c7) - Remove Sapphire-carcass APIs with no aliases: addon SDK is plain `defineModule`/`defineCommand` data (deleted `DefineModule`/`Module`/`BaseCommand`/`BaseSubcommand`/`CommandRegistry`/`captureBuilder`), single `ScheduledTasks` source of truth, one reply stack (`ctx.reply*`), fail-closed unknown gates, deleted dead infra services (`BaseRepository`, `CacheService`, `InfrastructureDatabaseService`, outbox, queue-service barrel), `prisma/errors` inlined at the RPC boundary, `repositoryCache` co-located with `CacheStore`, explicit Valkey publishers, global `lock.ts` shim removed. Deleted the dead `permission` RPC option.

### Minor Changes

- [`273ff04`](https://github.com/lumi-devs/Lumi/commit/273ff045cb269aae9ee6b0038fe6d30ce76cf4b4) - Sapphire-as-thin-adapter refactor: `LumiCommand`/`LumiListener`/`LumiSubcommand`/`LumiPrecondition` bases, canonical `LumiPermissionPrecondition` with per-subcommand nodes, `interactions/` layout (`KnownSubstores` renames `interaction-handlers` to `interactions`), service re-export shims removed.

### Patch Changes

- [`26bb968`](https://github.com/lumi-devs/Lumi/commit/26bb968e6f45cf149040c8ef29733f5707b50f22) - Rebuild test coverage on the def-based APIs: command handlers run through real `CommandContext`s, listeners through `execute(services, ...)`, interactions through `run(services, ...)`, ModuleStore against its real discovery lifecycle. No production code changes.

- [`e1238f6`](https://github.com/lumi-devs/Lumi/commit/e1238f6608bf4b648b9a21dc8c05226ae8811b1e) - Log a warning when a component interaction matches no handler. Unmatched button/select clicks previously failed with "did not respond in time" and left no trace in the logs; the dispatch watchdog now records the customId, user, and guild.

- [`1a0d467`](https://github.com/lumi-devs/Lumi/commit/1a0d467fd385f37df63a567f0041461d55be1984) - Purge Sapphire-era test doubles and break the services/DatabaseService/repository import cycle: delete obsolete class-based command/listener/store tests, drop dead `container.stores` mocks, move the shared `repositoryCache` next to `CacheStore`, resolve services lazily in the repository base.
- Updated dependencies [[`e1238f6`](https://github.com/lumi-devs/Lumi/commit/e1238f6608bf4b648b9a21dc8c05226ae8811b1e), [`edfe1a7`](https://github.com/lumi-devs/Lumi/commit/edfe1a76d38f6083fad667d2568f18ce1a7775c7), [`273ff04`](https://github.com/lumi-devs/Lumi/commit/273ff045cb269aae9ee6b0038fe6d30ce76cf4b4)]:
  - @lumi/application@1.0.0
  - @lumi/infrastructure@0.6.1
  - @lumi/contracts@0.8.0
