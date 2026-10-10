---
"@lumi/core": minor
"@lumi/application": patch
"@lumi/cli": patch
---

Follow-up hardening on the lib reorg: proper filenames, flatter topology, no operator-config or emoji-map modules.

- Filenames: all remaining PascalCase files in `packages/core/src/lib` (`CacheStore`, `GuildContext`, `LumiClient`, `ReadinessProbes`, `StreamBus`, `LumiPinoLogger` → `pino-logger`, `ModuleStore`/`Module`/`Utility`, `PermitResolver`, `DatabaseService`, all 13 `prisma/repositories/*`, `RegexWorkerHandler` → `regex-worker/handler`) and the touched `application/services/mod` files (`actions/*Action` → kebab, `runModerationAction` → `run-moderation-action`) are now kebab-case. `utilities/misc.ts` is dissolved into `snowflakes.ts`, `audit-reason.ts`, `serialized-work.ts`, `version.ts` (`isModuleEnabled` inlined as `services.db.modules.isModuleEnabled` at all 8 use sites, `canSendMessages` moved into the afk listener); `doctor/util.ts` → `run-check.ts`. All importers updated, no shims.
- Topology (vs Skyra `src/{commands,listeners,preconditions,arguments,tasks}` + flat domain `lib/`): `cluster/shard-lease.ts` merged into `sharding/`, one-file `telemetry/` and `retention/` flattened to root `telemetry.ts` / `retention.ts`. Skyra parity confirmed for `commands/`, `listeners/`, `permissions/` (preconditions), `scheduler/` (tasks), domain `lib/` folders.
- Deleted: `lib/ui/emoji.ts` and `lib/utilities/assets.ts` (emoji are unicode literals at use sites; builder `setEmoji` goes through the new `componentEmoji()` helper in the panel kit; operator `config/emojis.ts` overrides removed), and `lib/utilities/config.ts` with operator `config/bot.ts` (presence hardcoded to Watching "the server" / online, links hardcoded, `resolveCardColor` now a pure palette lookup in `lib/ui/palette.ts` with no override state, isolate bundle no longer bakes branding colors). Addon SDK drops the `Emojis` export and the `@discordjs/formatters` re-export from `lumi/utils`.
- Fixes: warn-threshold RPC duration prose updated to the current sapphire formatter output ("1 hour"), `lumi addon test` returns 1 (instead of throwing) when the addon directory does not exist.
