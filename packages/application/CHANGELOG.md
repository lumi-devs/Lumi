# @lumi/application

## 1.0.1

### Patch Changes

- [#186](https://github.com/lumi-devs/Lumi/pull/186) [`879ddaf`](https://github.com/lumi-devs/Lumi/commit/879ddaf93c2a63e641e6ac3896560bd4e59dcb5a) Thanks [@rebizzz](https://github.com/rebizzz)! - Follow-up hardening on the lib reorg: proper filenames, flatter topology, no operator-config or emoji-map modules.
  
  - Filenames: all remaining PascalCase files in `packages/core/src/lib` (`CacheStore`, `GuildContext`, `LumiClient`, `ReadinessProbes`, `StreamBus`, `LumiPinoLogger` → `pino-logger`, `ModuleStore`/`Module`/`Utility`, `PermitResolver`, `DatabaseService`, all 13 `prisma/repositories/*`, `RegexWorkerHandler` → `regex-worker/handler`) and the touched `application/services/mod` files (`actions/*Action` → kebab, `runModerationAction` → `run-moderation-action`) are now kebab-case. `utilities/misc.ts` is dissolved into `snowflakes.ts`, `audit-reason.ts`, `serialized-work.ts`, `version.ts` (`isModuleEnabled` inlined as `services.db.modules.isModuleEnabled` at all 8 use sites, `canSendMessages` moved into the afk listener); `doctor/util.ts` → `run-check.ts`. All importers updated, no shims.
  - Topology (vs Skyra `src/{commands,listeners,preconditions,arguments,tasks}` + flat domain `lib/`): `cluster/shard-lease.ts` merged into `sharding/`, one-file `telemetry/` and `retention/` flattened to root `telemetry.ts` / `retention.ts`. Skyra parity confirmed for `commands/`, `listeners/`, `permissions/` (preconditions), `scheduler/` (tasks), domain `lib/` folders.
  - Deleted: `lib/ui/emoji.ts` and `lib/utilities/assets.ts` (emoji are unicode literals at use sites; builder `setEmoji` goes through the new `componentEmoji()` helper in the panel kit; operator `config/emojis.ts` overrides removed), and `lib/utilities/config.ts` with operator `config/bot.ts` (presence hardcoded to Watching "the server" / online, links hardcoded, `resolveCardColor` now a pure palette lookup in `lib/ui/palette.ts` with no override state, isolate bundle no longer bakes branding colors). Addon SDK drops the `Emojis` export and the `@discordjs/formatters` re-export from `lumi/utils`.
  - Fixes: warn-threshold RPC duration prose updated to the current sapphire formatter output ("1 hour"), `lumi addon test` returns 1 (instead of throwing) when the addon directory does not exist.

- [#186](https://github.com/lumi-devs/Lumi/pull/186) [`879ddaf`](https://github.com/lumi-devs/Lumi/commit/879ddaf93c2a63e641e6ac3896560bd4e59dcb5a) Thanks [@rebizzz](https://github.com/rebizzz)! - Overhaul `packages/core/src/lib`: split `addon-sandbox/` into `host/` + `isolate/` + `sdk/`, delete `branding/`, dissolve `moderation/`, regroup flat root files. No backward-compat shims — all importers updated.
  
  - `addon-sandbox/`: `host/` (`addon-host.ts` renamed from `AddonHost.ts`, `host-methods.ts`, `capabilities.ts`, `sandbox-root.ts`, `addon-files.ts`), `isolate/` (`dispatch.ts`, `isolate-build.ts`, `event-relay.ts`, `interaction-router.ts`, `proxy-command.ts`, `proxy-module.ts`, `relay-task.ts`, `ndjson.ts`, `test-harness.ts`), `sdk/` unchanged plus colocated `sdk.test.ts`. Comment density already low from prior passes; nothing left to strip.
  - `branding/` deleted: palette + overrides live in `lib/ui/palette.ts`, emoji map in `lib/ui/emoji.ts` (both dependency-free so the isolate bundle can still bake operator overrides at build time); `utilities/config.ts` keeps the single `resolveCardColor` path wired to `config/bot.ts`.
  - `moderation/` dissolved: `ModerationCommand.ts` → `lib/commands/moderation-flow.ts`, `lockdown.ts` → `lib/discord/channel-locks.ts`, `multi-target.ts` → `lib/discord/mass-targets.ts`, `log.ts` → `lib/discord/mod-log.ts` (framework helpers shared across mod/security/filter); `QuarantineAction.ts` → `application/services/mod/actions/QuarantineAction.ts` and `immune-roles.ts` → `application/services/mod/immune-roles.ts` (mod-domain logic, also exported from the mod service barrel).
  - `SecurityRepository.getPanicState` is now `getOrSet`-cached (new `ValkeyTTL.panicState = 60`), invalidated in `save/clearPanicState`: it runs on every mod command (`checkPanicLock`) and every channel/role-delete audit entry, mirroring the `isVoiceMuted` precedent.
  - Flat root regrouped: `message-content.ts` → `utilities/`, `guild-transaction.ts` → `prisma/`, `gdpr.ts` → `gdpr/requests.ts`, `gdpr-export-token.ts` → `gdpr/export-token.ts`. `restart.ts`, `services.ts`, `env.ts` stay (no cluster); single-file `cluster/`/`sharding/`/`telemetry/`/`retention/` dirs left alone.
  - Import vocabulary renamed: `#lib/*.js` → `@lumi/lib/*.js`, `#modules/*.js` → `@lumi/modules/*.js` (tsconfig paths + Bun runtime, `.js` suffixes kept). The `imports` maps are deleted from `@lumi/core`/`@lumi/application`; no backward-compat shims.
- Updated dependencies [[`8c5a209`](https://github.com/lumi-devs/Lumi/commit/8c5a209ca043ae6762d09561a199555c236ced0d), [`8c5a209`](https://github.com/lumi-devs/Lumi/commit/8c5a209ca043ae6762d09561a199555c236ced0d), [`8c5a209`](https://github.com/lumi-devs/Lumi/commit/8c5a209ca043ae6762d09561a199555c236ced0d), [`8c5a209`](https://github.com/lumi-devs/Lumi/commit/8c5a209ca043ae6762d09561a199555c236ced0d), [`879ddaf`](https://github.com/lumi-devs/Lumi/commit/879ddaf93c2a63e641e6ac3896560bd4e59dcb5a), [`879ddaf`](https://github.com/lumi-devs/Lumi/commit/879ddaf93c2a63e641e6ac3896560bd4e59dcb5a), [`879ddaf`](https://github.com/lumi-devs/Lumi/commit/879ddaf93c2a63e641e6ac3896560bd4e59dcb5a), [`879ddaf`](https://github.com/lumi-devs/Lumi/commit/879ddaf93c2a63e641e6ac3896560bd4e59dcb5a), [`879ddaf`](https://github.com/lumi-devs/Lumi/commit/879ddaf93c2a63e641e6ac3896560bd4e59dcb5a)]:
  - @lumi/contracts@0.9.0
  - @lumi/infrastructure@0.6.2
  - @lumi/shared@0.1.1

## 1.0.0

### Major Changes

- [`e1238f6`](https://github.com/lumi-devs/Lumi/commit/e1238f6608bf4b648b9a21dc8c05226ae8811b1e) - Remove Sapphire runtime: plain discord.js `Client`, own module/utility registries, own services container. No backward compatibility, no shims.

### Patch Changes

- [`edfe1a7`](https://github.com/lumi-devs/Lumi/commit/edfe1a76d38f6083fad667d2568f18ce1a7775c7) - Remove Sapphire-carcass APIs with no aliases: addon SDK is plain `defineModule`/`defineCommand` data (deleted `DefineModule`/`Module`/`BaseCommand`/`BaseSubcommand`/`CommandRegistry`/`captureBuilder`), single `ScheduledTasks` source of truth, one reply stack (`ctx.reply*`), fail-closed unknown gates, deleted dead infra services (`BaseRepository`, `CacheService`, `InfrastructureDatabaseService`, outbox, queue-service barrel), `prisma/errors` inlined at the RPC boundary, `repositoryCache` co-located with `CacheStore`, explicit Valkey publishers, global `lock.ts` shim removed. Deleted the dead `permission` RPC option.
- Updated dependencies [[`edfe1a7`](https://github.com/lumi-devs/Lumi/commit/edfe1a76d38f6083fad667d2568f18ce1a7775c7), [`273ff04`](https://github.com/lumi-devs/Lumi/commit/273ff045cb269aae9ee6b0038fe6d30ce76cf4b4)]:
  - @lumi/infrastructure@0.6.1
  - @lumi/contracts@0.8.0
