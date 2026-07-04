# Common listener base + typed service registry

Date: 2026-07-02. Approved scope: listener unification + full pattern audit fixes.

## Problem

- Module listeners outside afk/filter extend raw Sapphire `Listener` and each
  hand-roll guild checks + `isModuleEnabled` gating (logging ×7, tempvc ×3).
- 18 call sites do `container.stores.get("services").get("x") as XService` —
  an unchecked cast that a typo breaks at runtime, not compile time.

## Design

### 1. `ModuleListener` (core/module-system/ModuleListener.ts)

One generic base every module listener extends. Options add a required
`module: string`. `run()`:

1. `resolveGuildId(...args)` — default heuristic reads `guildId` / `guild.id`
   off the first event arg (covers Message, GuildMember, GuildBan, VoiceState);
   overridable for odd events. Null → drop (also replaces per-listener
   `if (!guildId) return`).
2. Gate on `isModuleEnabled(guildId, module)`.
3. Call abstract `handle(...args)`.

Typed as `ModuleListener<E extends keyof ClientEvents>`; the custom
`lumiGuildUserMessage` event is already in the `ClientEvents` augmentation, so
`GuildMessageListener` becomes a thin specialization (pins the event + the
`GuildMessage` handle signature). No behavior change for afk/filter.

### 2. Typed service registry (core/module-system/Service.ts)

`interface Services {}` + `getService<K extends keyof Services>(name)` helper.
Each service file augments `Services` with its name → class mapping
(Sapphire `Preconditions`-augmentation pattern). Migrate all 18 cast sites.
Registered services: config, permissions, guild-settings, guild-log,
downloader, afk, filter, tempvc.

### 3. Migrations

- logging ×7 → `ModuleListener` with `module: "logging"`; `lib/send.ts`
  `isLoggingEnabled` drops its module-enabled check (base class owns it) and
  keeps only the per-event toggle.
- tempvc `voiceStateUpdate` stays raw **on purpose**: leftover-channel cleanup
  must run while the module is disabled. `raw.ts` / `ready.ts` aren't
  guild-gated events; they stay raw too.

## Non-goals

No new event-router fanout for low-frequency events, no custom-id parse
helper, no entity-cache read-path changes.

## Verification

`bun run typecheck` + `bun run lint` in packages/core; existing tests.

## Addendum — second sweep (same day)

- **Auto builder defaults**: `autoApplyCommandDefaults` (core/lib/commands.ts)
  shadows `registerApplicationCommands` in both base ctors (same pattern as
  `instrumentCommandPiece`) and applies `defaultMemberPermissions` / `contexts`
  / `integrationTypes` to every registered builder before the subclass callback
  runs. The hand-written setter trio was deleted from all 18 commands; a
  command overrides a default by calling the setter itself.
- **`RelayTask<K>`** (core/lib/scheduled-tasks.ts): shouldRunNow gate +
  publishTaskFire relay in one base; the 4 task pieces are now empty subclasses.
  Dropped flushLogs.ts's duplicate `ScheduledTasks` augmentation (common.ts owns it).
- **9 leftover `as XService` casts** (getter-style, missed by the first codemod)
  migrated to `getService(...)`: module/dashboard/prefix/language/download/repo
  commands, module-update handler, CoreModule RPC, tempvc ready listener.
- **Reply hygiene**: language/prefix chat-input paths now use
  `this.replySuccess`/`this.replyError`; tempvc panel/list use
  `this.reply(i, ephemeralCard(card))` instead of OR-ing MessageFlags.
