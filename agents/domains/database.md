# Database

Grounded in `packages/core/src/lib/prisma/` and `prisma/schema.prisma`.

## `container.db` vs raw Prisma

`container.db` is a `DatabaseService`
(`packages/core/src/lib/prisma/database-service.ts:46`), a facade holding one
repository per domain. Its class doc (`:36-45`) states the law directly:
`container.db.<repo>.<method>` is the only sanctioned data-access path —
never raw Prisma from a module. (`services.prisma.$connect()` /
`services.invalidation.start()` run at boot, `lumi-client.ts:126-127`;
`disconnectDatabase()` on shutdown, `:209`.)

The addon validator errors on the removed class API (`@DefineModule`/
`BaseCommand`/`Module`, `validate.ts:477`) — addons never touch the database
directly at all; persistence is `lumi/kv` / `lumi/valkey` over host RPC.

## Repository pattern

One class per domain under `packages/core/src/lib/prisma/repositories/`,
extending the abstract `Repository` base (`Repository.ts:7`). Constructor takes
`(prisma, valkey, logger, db, reader?)` — `reader` is an optional replica
client for lag-tolerant fleet sweeps (used by `ModerationRepository` and
`AfkRepository`, `database-service.ts:101,108`).

The base provides `invalidate(...keys)` (`Repository.ts:22`, via
`container.invalidation`) and cache-aside `getOrSet` (`Repository.ts:30`,
delegating to `repositoryCache.getOrLoad`). Method naming is consistent:
`get*`/`list*` reads, single-row writes, `*Many` bulk writes,
`clear*`/`delete*` removal. Multi-step writes use `this.prisma.$transaction`
directly — see `EconomyRepository.applyMutation`
(`modules/economy/data/EconomyRepository.ts:74`).

`AuditRepository` never hits Postgres on the hot path: `queueAuditLog`
(`AuditRepository.ts:73`) XADDs into Valkey Streams (`auditLogsQueue` bucket
picked once per process, `:48,75`), and `flushAuditLogsToPostgres` (`:89`)
drains them, reclaiming delivered-but-unacked entries first. Malformed payloads
land in `droppedIds` (`:144`) rather than failing the batch. Read it in full
before touching anything audit-adjacent.

## Config persistence: the three-table model

| Table | Model | Notes |
| --- | --- | --- |
| `guild_module_config` | `GuildModuleConfig` (`schema.prisma:161`) | one row per `(guildId, moduleName, configKey)`, bare `Json` value |
| `module_config_history` | `ModuleConfigHistory` (`schema.prisma:456`) | append-only dashboard audit trail |
| `module_config_overrides` | `ModuleConfigOverride` (`schema.prisma:478`) | per-scope values, `uq_config_override` (`:489`) |

IDs are `Int @default(autoincrement())`, not cuid. `ConfigRepository`
(`getAllModuleConfig` `:69`, `setModuleConfig` `:107`,
`invalidateModuleConfig` `:148`) folds a module's rows into one flat record,
cached per `(moduleName, guildId)`.

`configKey` is a plain string scoped only by `(guildId, moduleName)` — no FK
ties it to the schema. `log_channel_id` is independently declared in four
modules (`filter/index.ts:174`, `mod/index.ts:20`, `logging/index.ts:17`,
`security/index.ts:58`), so grepping-and-renaming it globally is wrong; check
the `moduleName` in scope. `logging` defines its three channel keys as
constants (`logging/services/send.ts`, now under `packages/application`) so
that module's own keys can't collide — copy that pattern past one channel key.

## `InvalidationBus` (`container.invalidation`)

Thin `InvalidationBus extends InfraInvalidationBus`
(`packages/core/src/lib/valkey/buses.ts:12`, `invalidate` override at `:21`);
the real implementation is `packages/infrastructure/src/cache/valkey.ts`
(channel `"lumi:cache:invalidate"`, `:317`). `invalidate(...keys)` (`:364`)
deletes locally and publishes so every shard evicts too — this is what makes
`getOrSet` safe across the fleet. Lifecycle `start`/`stop`/`close`
(`:355,381,389`); `onInvalidate` (`:345`) for non-`getOrSet` caches,
`onResync` (`:350`) after reconnects.

Every cached-read repository calls `this.invalidate(...)` right after its
Prisma write — e.g. `ModuleRepository.setModuleGlobalEnabled`
(`ModuleRepository.ts:42-55`).
