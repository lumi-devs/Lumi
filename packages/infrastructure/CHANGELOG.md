# @lumi/infrastructure

## 0.6.2

### Patch Changes

- [`8c5a209`](https://github.com/lumi-devs/Lumi/commit/8c5a209ca043ae6762d09561a199555c236ced0d) - Notify local invalidation listeners synchronously inside `invalidate`, instead of only on the pub/sub loopback. A write followed by a re-read in the same tick (e.g. panel pick → re-render) previously saw the stale L1 entry and needed a manual refresh.

- [#186](https://github.com/lumi-devs/Lumi/pull/186) [`879ddaf`](https://github.com/lumi-devs/Lumi/commit/879ddaf93c2a63e641e6ac3896560bd4e59dcb5a) Thanks [@rebizzz](https://github.com/rebizzz)! - Overhaul `packages/core/src/lib`: split `addon-sandbox/` into `host/` + `isolate/` + `sdk/`, delete `branding/`, dissolve `moderation/`, regroup flat root files. No backward-compat shims — all importers updated.
  
  - `addon-sandbox/`: `host/` (`addon-host.ts` renamed from `AddonHost.ts`, `host-methods.ts`, `capabilities.ts`, `sandbox-root.ts`, `addon-files.ts`), `isolate/` (`dispatch.ts`, `isolate-build.ts`, `event-relay.ts`, `interaction-router.ts`, `proxy-command.ts`, `proxy-module.ts`, `relay-task.ts`, `ndjson.ts`, `test-harness.ts`), `sdk/` unchanged plus colocated `sdk.test.ts`. Comment density already low from prior passes; nothing left to strip.
  - `branding/` deleted: palette + overrides live in `lib/ui/palette.ts`, emoji map in `lib/ui/emoji.ts` (both dependency-free so the isolate bundle can still bake operator overrides at build time); `utilities/config.ts` keeps the single `resolveCardColor` path wired to `config/bot.ts`.
  - `moderation/` dissolved: `ModerationCommand.ts` → `lib/commands/moderation-flow.ts`, `lockdown.ts` → `lib/discord/channel-locks.ts`, `multi-target.ts` → `lib/discord/mass-targets.ts`, `log.ts` → `lib/discord/mod-log.ts` (framework helpers shared across mod/security/filter); `QuarantineAction.ts` → `application/services/mod/actions/QuarantineAction.ts` and `immune-roles.ts` → `application/services/mod/immune-roles.ts` (mod-domain logic, also exported from the mod service barrel).
  - `SecurityRepository.getPanicState` is now `getOrSet`-cached (new `ValkeyTTL.panicState = 60`), invalidated in `save/clearPanicState`: it runs on every mod command (`checkPanicLock`) and every channel/role-delete audit entry, mirroring the `isVoiceMuted` precedent.
  - Flat root regrouped: `message-content.ts` → `utilities/`, `guild-transaction.ts` → `prisma/`, `gdpr.ts` → `gdpr/requests.ts`, `gdpr-export-token.ts` → `gdpr/export-token.ts`. `restart.ts`, `services.ts`, `env.ts` stay (no cluster); single-file `cluster/`/`sharding/`/`telemetry/`/`retention/` dirs left alone.
  - Import vocabulary renamed: `#lib/*.js` → `@lumi/lib/*.js`, `#modules/*.js` → `@lumi/modules/*.js` (tsconfig paths + Bun runtime, `.js` suffixes kept). The `imports` maps are deleted from `@lumi/core`/`@lumi/application`; no backward-compat shims.

- [#186](https://github.com/lumi-devs/Lumi/pull/186) [`879ddaf`](https://github.com/lumi-devs/Lumi/commit/879ddaf93c2a63e641e6ac3896560bd4e59dcb5a) Thanks [@rebizzz](https://github.com/rebizzz)! - Remove dead observability/infra surface: unused `lumi_utilities_*` and `lumi_bus_events_*` metrics, stale `gateway:9090` Prometheus target, and the `@lumi/infrastructure/services` export pointing at a nonexistent `src/services/` directory.

## 0.6.1

### Patch Changes

- [`edfe1a7`](https://github.com/lumi-devs/Lumi/commit/edfe1a76d38f6083fad667d2568f18ce1a7775c7) - Remove Sapphire-carcass APIs with no aliases: addon SDK is plain `defineModule`/`defineCommand` data (deleted `DefineModule`/`Module`/`BaseCommand`/`BaseSubcommand`/`CommandRegistry`/`captureBuilder`), single `ScheduledTasks` source of truth, one reply stack (`ctx.reply*`), fail-closed unknown gates, deleted dead infra services (`BaseRepository`, `CacheService`, `InfrastructureDatabaseService`, outbox, queue-service barrel), `prisma/errors` inlined at the RPC boundary, `repositoryCache` co-located with `CacheStore`, explicit Valkey publishers, global `lock.ts` shim removed. Deleted the dead `permission` RPC option.
