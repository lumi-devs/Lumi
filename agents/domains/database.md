# Database

Everything here is grounded in `packages/core/src/lib/prisma/` and `prisma/schema.prisma`.

## `container.db` vs `container.prisma`

`container.db` is a `DatabaseService` (`packages/core/src/lib/prisma/DatabaseService.ts:55`),
a thin facade holding one repository instance per domain (`config`, `modules`, `audit`,
`economy`, `moderation`, `permissions`, ...). The class doc at `DatabaseService.ts:44-51`
states it directly: `container.db.<repo>.<method>` is "the only sanctioned data-access path
for features - never touch `container.prisma` from a module."

`container.prisma` is the raw Prisma client, installed onto the container in
`packages/core/src/lib/client/container-services.ts`. First-party legitimate uses are exactly
two:

- `LumiClient.ts:75` — `await container.prisma.$connect();` in `login()`, the one-time startup
  handshake, before `container.invalidation.start()` runs on the next line.
- `packages/core/src/lib/prisma/client.ts` — `disconnectDatabase()`, the `$disconnect()`
  counterpart called during shutdown.

There is no `packages/core` production code path that reaches `container.prisma` for an
actual query — grep confirms the only other hit is `downloader/validate.ts:330-333`, which
*bans* it: the addon validator flags any third-party module source file that references
`container.prisma`, since addons get no schema access and must persist through
`container.db.guildKV` or `container.redis` instead.

`DatabaseService` also owns a few cross-repository operations directly, because they touch
tables owned by more than one repository: `ensureGuild`, `deleteUserData` (GDPR erasure —
spans `PermitAssignment`, `Blocklist`, `AuditLedger`, `User`), `exportUserData`, `transaction`
(guild-scoped write transaction, see `#lib/guild-transaction.js`), `probePrisma` and
`getPostgresStats` (health/metrics raw SQL).

## Repository pattern

One class per domain under `packages/core/src/lib/prisma/repositories/`, each extending the
abstract `Repository` base (`Repository.ts:10`). The base class constructor takes
`(prisma, redis, logger, db, reader = prisma)` — every repository gets a back-reference to
the owning `DatabaseService` (`this.db`) so it can call across into a sibling repository
(e.g. `ConfigRepository.setModuleConfig` calls `this.db.configHistory?.logConfigChange(...)`,
`ConfigRepository.ts:128`), and an optional `reader` client for fleet-wide sweeps that can
tolerate replication lag (used by `ModerationRepository` and `AfkRepository`,
`DatabaseService.ts:91,104`).

`Repository` provides two protected primitives every subclass builds on:

- `invalidate(...keys)` (`Repository.ts:25`) — delegates to
  `container.invalidation.invalidate(...)`.
- `getOrSet(key, ttl, fetcher, parser?, serializer?)` (`Repository.ts:29`) — cache-aside read
  with request coalescing: concurrent callers for the same key share one in-flight promise
  (module-level `inflight` map, `Repository.ts:7`), and cache hit/miss counters
  (`cacheHits`/`cacheMisses` from `@lumi/observability`) are tagged with the Redis key's
  second colon-segment as the `cache` label (`Repository.ts:36`).

Method naming is consistent across repositories: `get*`/`list*`/`find*` for reads,
`set*`/`upsert`-flavored `create`/`update` wrappers for single-row writes, `*Many` for bulk
writes (`setModuleConfigsMany`, `ConfigRepository.ts:180`), and `clear*`/`delete*` for removal.
Domain repositories that need transactional multi-step writes reach for
`this.prisma.$transaction(...)` directly rather than composing several single-row calls —
see `EconomyRepository.applyMutation` (`EconomyRepository.ts:85`), which upserts the account,
runs a guarded conditional `updateMany` (`wallet: { gte: -delta }` in the `WHERE` clause so
concurrent debits serialize on the row instead of overdrawing it), and appends the ledger row,
all inside one interactive transaction. The class doc at `EconomyRepository.ts:46-54` is
explicit that balances are "deliberately never cached in Redis - a stale read here is a
double-spend" — economy is the one domain repository with zero `getOrSet` calls.

`AuditRepository` is architecturally different from the rest: writes don't hit Postgres at
all on the hot path. `queueAuditLog`/`queueAuditLogsBatch` (`AuditRepository.ts:63,75`) XADD
into one of 16 fixed Redis Streams (`auditLogsQueue:<bucket>`, bucket picked once per process
via `getWriteBucket`, `AuditRepository.ts:39`), and a separate scheduled task calls
`flushAuditLogsToPostgres` (`AuditRepository.ts:97`) which drains every bucket concurrently
(4 at a time via `mapWithConcurrency`), using `XAUTOCLAIM` first to reclaim any
delivered-but-unacked entries from a crashed previous run before doing a fresh
`XREADGROUP`. This is the one repository worth reading in full before touching audit-adjacent
code — the ack/dead-letter handling (`droppedIds` for malformed payloads, per-row fallback
insert on batch failure, `AuditRepository.ts:181-223`) is not obvious from the public API
alone.

## Config persistence: the three-table model

Guild-scoped module config lives across three tables, each owned by its own repository:

| Table (`@@map`) | Prisma model | Repository | Compound PK / unique |
| --- | --- | --- | --- |
| `guild_module_config` | `GuildModuleConfig` (`schema.prisma:99`) | `ConfigRepository` | `@@id([guildId, moduleName, configKey])` |
| `module_config_history` | `ModuleConfigHistory` (`schema.prisma:375`) | `ConfigHistoryRepository` | `id` (cuid), indexed on `[guildId, moduleName, createdAt]` |
| `module_config_overrides` | `ModuleConfigOverride` (`schema.prisma:398`) | `ConfigOverrideRepository` | `id` (cuid), `@@unique([guildId, moduleName, key, modelType, modelId], name: "uq_config_override")` |

`GuildModuleConfig.value` is a bare `Json` column (`@map("value_json")`) — one row per
`(guildId, moduleName, configKey)`, holding whatever shape the module's `cfg.*` schema field
declares (`config-schema.ts` — `cfg.boolean`, `cfg.channel`, `cfg.multiRole`, etc. all persist
as the same generic `Json`). `ConfigRepository.getAllModuleConfig` (`ConfigRepository.ts:70`)
reads every row for a `(guildId, moduleName)` pair and folds it into a flat
`Record<configKey, value>`, cached at `RedisKeys.guildConfig(moduleName, guildId)`.
`setModuleConfig` (`ConfigRepository.ts:108`) upserts on the compound key and, when an
`actorId` is passed, fires an unawaited (`.catch`-guarded) call into
`configHistory.logConfigChange` so a slow audit write never blocks the config write itself.

**Why a bare rename of `configKey` is unsafe:** `configKey` is a plain `VarChar(64)` string,
scoped only by `(guildId, moduleName)` — there is no foreign key or enum tying it to the
module's declared schema. `log_channel_id` is independently declared as a `cfg.channel(...)`
field in four separate modules' `configSchema`: `filter/index.ts:147`, `mod/index.ts:18`,
`logging/index.ts:19`, and `security/index.ts:41`. Each module owns its own
`(moduleName, "log_channel_id")` row, so there's no live collision across modules today — but
it does mean grepping for `log_channel_id` and renaming every hit is wrong; you have to check
the `moduleName` in scope. Contrast with `logging/lib/send.ts:7-9`, which defines
`MessageLogChannelKey`/`MemberLogChannelKey`/`DefaultLogChannelKey` as constants specifically
so that module's *own* three log-channel keys don't collide with each other or get
typo'd inline — a pattern worth copying for any module introducing more than one channel-typed
config key.

`ModuleConfigOverride` layers a per-scope value (`modelType`: `channel | role | user |
category`, per the schema comment at `schema.prisma:403`) on top of the base
`GuildModuleConfig` value — `ConfigOverrideRepository` (`ConfigOverrideRepository.ts:18`) does
not itself resolve precedence between override and base value; the module reading config is
responsible for consulting overrides where relevant. `ConfigHistoryRepository` is
append-only and purely for the dashboard's audit trail — nothing reads it back into live
config resolution.

`ConfigRepository.mutateModuleConfig` (`ConfigRepository.ts:269`) is the one atomic
read-modify-write primitive: it takes a Redis lock scoped to
`lock:config-mutate:<moduleName>:<guildId>:<key>` via `acquireRedisLock`, then get-then-set
under that lock — the documented alternative to addon authors hand-rolling a racy
get-then-set (the doc comment explicitly compares it to Red-DiscordBot's
`async with config.guild(g).some_list() as l:`).

## `InvalidationBus` (`container.invalidation`)

Defined in `packages/core/src/lib/database/redis.ts:227` (`class InvalidationBus`), installed
onto the container in `container-services.ts:73` as
`new InvalidationBus(createRedisClient())` — a dedicated Redis connection used only as a
pub/sub subscriber on channel `"lumi:cache:invalidate"` (`redis.ts:216`).

The real method every repository calls is `invalidate(...keys: string[])`
(`redis.ts:260`): it deletes the keys on *this* process's Redis view (`delSafe`) and publishes
`{ keys, time: Date.now() }` on the invalidation channel so every other shard/process in the
fleet also evicts those keys from its own cache — this is what makes `getOrSet`'s cache-aside
reads safe across a multi-shard fleet where each process could otherwise keep serving a stale
cached value after another shard's write.

`start()`/`stop()`/`close()` manage the subscription lifecycle (`redis.ts:251,274,283`) —
`start()` is called once from `LumiClient.login()` right after `container.prisma.$connect()`.
`onInvalidate(fn)` and `onResync(fn)` (`redis.ts:241,246`) are the two extension points: any
in-process cache that isn't backed by `getOrSet` (e.g. `PrefixCache`, wired up in
`LumiClient.ts:61` via `attachToInvalidationBus`) registers an `onInvalidate` listener to purge
its own state, and `onResync` listeners fire when the subscriber connection drops and
reconnects (`#onReady`, `redis.ts:333`) — the `ResyncContext.cutoff` timestamp tells listeners
how far back they may have missed invalidations while disconnected, so they know whether a
full resync is warranted.

What actually triggers an invalidation: every repository write path that has a cached read
counterpart calls `this.invalidate(...)` right after the Prisma write — e.g.
`ModuleRepository.setModuleGlobalEnabled` invalidates `RedisKeys.moduleGlobalEnabled(name)`
right after the upsert (`ModuleRepository.ts:37-43`), and
`ConfigRepository.invalidateModuleConfig` (private, `ConfigRepository.ts:148`) invalidates
both the per-module and the all-modules-for-guild cache keys together, since
`getAllModuleConfigsForGuild` folds every module's config into one cached `Map`.
