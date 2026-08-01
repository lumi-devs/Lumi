# Lumi readability refactor plan

Source: architecture audit comparing lumi against Skyra (same `@sapphire/framework` base)
and yagpdb. Verdict: lumi's core architecture (module-system, moderation actions, config
schema) is sound and matches Sapphire idioms — this is not a rewrite, it's a cleanup pass.
Items are ordered by impact/effort; each references the exact files involved.

## Keep as-is (don't touch during cleanup)

- `packages/core/src/lib/module-system/{Module,ModuleStore}.ts` — dependency-sorted,
  hot-reloadable module system. Real requirement (live addon marketplace + per-guild
  toggling), Skyra doesn't need this because it ships one static command set.
- `packages/core/src/lib/module-system/config-schema.ts` — compact dual-purpose
  validator/UI-metadata builder (146 lines), used by every module's `configSchema`.
- `packages/core/src/modules/mod/actions/*` — one file per moderation action type,
  mirrors Skyra's `src/lib/moderation/actions/ModerationAction*.ts` pattern.
- `packages/core/src/lib/entity-cache/RedisEntityCache.ts` — looks repetitive but each
  entity (guild/channel/role/user/member) has genuinely different shape/TTL concerns.

## Refactor punch list

1. **Extract a `ModerationCommand`/`ModerationSubcommand` base class**
   Modeled on `skyra/src/lib/moderation/structures/ModerationCommand.ts`. Every file in
   `packages/core/src/modules/mod/commands/` (`ban.ts`, `kick.ts`, `warn.ts`, ...)
   currently hand-rolls the same defer → fetchT → getX → try/catch → reply skeleton.
   Base class should own that flow via hooks: `resolveTarget(ctx)`, `action`, optional
   `preHandle`/`postHandle`/`buildSuccessMessage`. Highest-leverage single change —
   touches ~15 files, biggest readability win.

2. **Dedupe reply-helper methods on `BaseCommand`/`BaseSubcommand`**
   `packages/core/src/lib/commands.ts:388-405` (`BaseCommand`) and `:453-470`
   (`BaseSubcommand`) define identical `reply`/`replySuccess`/`replyError`/
   `replyWarning`/`replyInfo`/`checkPermit` methods. First verify no call site actually
   uses `this.replySuccess(...)` (commands appear to all use `ctx.replySuccess(...)`
   instead) — if confirmed dead, delete both copies rather than merging them.

3. **Remove the registry monkey-patch in `autoApplyCommandDefaults`**
   `packages/core/src/lib/commands.ts:292-339` temporarily overwrites
   `registry.registerChatInputCommand`/`registerContextMenuCommand` to inject
   `defaultMemberPermissions`/`contexts`/`integrationTypes`, then restores them in a
   `finally`. Replace with a direct call: have the base class invoke the subclass's
   builder callback and apply defaults to the returned builder object. No interception
   needed — Skyra does this by calling `applyLocalizedBuilder` explicitly per command.

4. **Split oversized multi-handler files into one piece per file**
   - `packages/core/src/modules/tempvc/interaction-handlers/tempvc-panel.ts` (609 lines,
     3 `InteractionHandler` classes)
   - `packages/core/src/modules/core/interaction-handlers/hub-panel.ts` (947 lines,
     3 `InteractionHandler` classes)
   Split each into `-button.ts` / `-select.ts` / `-modal.ts`, matching the convention
   `afk`/`filter`/`mod` already follow (one `Piece` per file). Shared helpers
   (e.g. `assertOwner`, `showRenameModal` in tempvc-panel.ts:71-140) move to a
   `lib/panel-helpers.ts` in the same module.

5. **Split `packages/core/src/lib/i18n/keys.ts`** (665 lines, flat const object) into
   per-domain files under `i18n/keys/` (e.g. `keys/commands.ts`, `keys/afk.ts`),
   mirroring Skyra's `src/lib/i18n/languageKeys/` directory. Reduces merge-conflict
   surface and improves discoverability.

6. **Extract UI-building code out of `core/lib/hub-panel.ts` (724 lines) and
   `core/lib/config-panel.ts` (735 lines)** into a `modules/core/ui/` directory, applying
   the pattern `modules/tempvc/ui/panel.ts` already uses correctly for that module.

7. **Decompose `packages/core/src/lib/client/LumiClient.ts`** (704 lines). Currently owns:
   Discord client lifecycle, RabbitMQ scheduler/task-fire consumers
   (`_schedulerRequestConsumer`, `_taskFireConsumer`), cluster bootstrap composition,
   leader election (`_resolveCommandRegistrationLeader`, ~line 598), readiness probes
   (`_registerReadinessProbes`, ~line 542). `ClusterBootstrap` is already its own
   composed class — give leader election and readiness probes the same treatment
   (`CommandRegistrationLeaderElection`, `ReadinessProbes`) so `LumiClient` composes
   rather than implements them.

8. **Split `packages/core/src/modules/core/commands/module.ts`** (621 lines, single
   command file). Pull builder/view logic into a `lib/` helper, same treatment as #6.

9. **Guard `DownloaderService.syncApplicationCommands`'s use of Sapphire internals**
   `packages/core/src/lib/services/DownloaderService.ts:471-543` reads
   `registry.applicationCommandRegistry`'s private `apiCalls` array via a hand-rolled
   `RegistryInternal` interface (:486-493) to re-sync commands after a live addon install
   without restarting. Legitimate need, undocumented API. Add a comment explaining why,
   pin/test against the `@sapphire/framework` version in use, and consider filing an
   upstream feature request for a public re-sync API.

10. **Audit `entity-cache` and `outbound` usage breadth**
    Both are used in only 3-4 files outside their own directory. Confirm they're not
    premature generalization for a need that only materialized at one call site; inline
    if so.

11. *(Cosmetic, do last)* Standardize interaction-handler file layout: pick the
    `afk`/`filter` convention (one piece per file) as house style, apply to any modules
    that still bundle handlers — after #4 lands, `tempvc` and `core` should already
    match.

## Reference implementations (skyra)

- `skyra/src/lib/moderation/structures/ModerationCommand.ts` — base for #1
- `skyra/src/commands/Moderation/ban.ts` — target shape for mod commands post-#1
- `skyra/src/lib/SkyraClient.ts` — composition style for #7 (note: not apples-to-apples,
  Skyra has no multi-process cluster to coordinate, but the composition pattern applies)
- `skyra/src/lib/i18n/languageKeys/` — target layout for #5
