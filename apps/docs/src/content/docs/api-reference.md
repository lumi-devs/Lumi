---
title: "Addon SDK API Reference"
description: "Every export of the addon SDK - the addon-facing API surface."
---

The public, stable surface for addon code - everything importable from `"lumi"` and its subpaths. This is the *only* import surface addon code should use; Lumi's internal `#core/*`, `#lib/*`, `#utilities/*`, and `#database/*` paths are implementation details that move on any core refactor (the addon linter warns if it sees one - see `bun run validate` in [`scripts/README.md`](https://github.com/lumi-devs/Lumi/blob/main/scripts/README.md)).

For a walkthrough of building something with this API, start with [Quick Start: Your First Addon](/Lumi/guides/quick-start-addon/), then the fuller [Module Creation Guide](/Lumi/guides/module-creation/) (written against the built-in `afk` module, but every extension point applies to addons identically). For the addon-specific rules on top of this API (no `container.prisma`, dependency isolation via `info.json`, etc.), see the [Addon Publishing Guide](/Lumi/guides/addon-publishing/).

Named after Red-DiscordBot's `redbot.core` / `redbot.core.commands` / `redbot.core.utils.chat_formatting` split, if you're coming from that ecosystem.

```typescript
import { Module, DefineModule, cfg, Service, getService } from "lumi";
import { BaseCommand, BaseSubcommand, CommandContext } from "lumi/commands";
import { PermissionLevel, isModuleEnabled } from "lumi/permissions";
import { scheduleTask, RelayTask, registerTaskFireHandler } from "lumi/scheduling";
import { makeSuccessCard, Emojis, confirmPrompt, paginateList } from "lumi/ui";
import { BotConfig, relativeTimestamp, parseDuration } from "lumi/utils";
```

Source: `packages/core/src/lib/addon-sdk/{index,commands,permissions,scheduling,ui,utils}.ts`. This page documents that file's actual re-exports - if the two ever disagree, the source is correct and this page is stale.

---

## `lumi` (top-level)

The module system fundamentals - every addon needs at least `Module`, `DefineModule`, and `cfg`.

### `Module`

```typescript
abstract class Module extends Piece {
  onLoad(): Awaitable<unknown>;
  onUnload(): Awaitable<unknown>;
  deleteUserData(userId: string, requester?: unknown): Awaitable<void>;
  exportUserData(userId: string): Awaitable<Record<string, unknown> | null>;
  reconcileScheduledJobs(): Awaitable<void>;
}
```

Base class for a module/addon's entrypoint class. Extends Sapphire's `Piece`. Implement `deleteUserData` and `exportUserData` if the addon stores anything keyed by a user ID (GDPR); documented no-ops (return `undefined`/`null`) are fine otherwise. See [Module Creation Guide § Lifecycle hooks](GUIDE_MODULE_CREATION.md#lifecycle-hooks) for when each hook fires.

### `DefineModule(options)`

Class decorator that stamps static `meta` onto a `Module` subclass - name, display info, config schema. Discoverable without executing the module's code.

```typescript
interface ModuleOptions {
  name?: string;
  displayName?: string;
  emoji?: string;
  description?: string;
  version?: string;
  conflicts?: string[];       // names of modules this one can't run alongside
  dependencies?: string[];    // names of modules that must be enabled first
  configSchema?: ModuleConfigSchema;   // built with cfg.object(...) - see below
  configFields?: ConfigField[];        // low-level alternative to configSchema
  configOverrides?: boolean;  // allow per-guild overrides? default true
  disableable?: boolean;      // can this ever be turned off? default true
}
```

### `cfg`

Config field builders backed by `@sapphire/shapeshift`, consumed by `DefineModule`'s `configSchema`. Every builder (except `cfg.object`) shares `{ label, description, required?, group? }`.

| Builder | Extra options | UI |
| :--- | :--- | :--- |
| `cfg.object(shape)` | - | wraps the whole schema |
| `cfg.boolean({ default })` | | Toggle |
| `cfg.number({ default, min, max })` | `min`/`max` become validation bounds | Number input |
| `cfg.string({ default, list })` | `list: true` → comma-separated, read back as `string[]` | Text input |
| `cfg.enum(choices, { default })` | `choices` a `const` tuple | Select dropdown |
| `cfg.channel({ default, channelTypes })` | snowflake-validated | Channel picker |
| `cfg.role({ default })` | snowflake-validated | Role picker |
| `cfg.user({ default })` | snowflake-validated | User picker |

```typescript
configSchema: cfg.object({
  log_channel_id: cfg.channel({ label: "Log Channel", description: "Where events post." }),
  threshold: cfg.number({ label: "Threshold", description: "...", default: 3, min: 1, max: 20 }),
})
```

Read a value back at runtime with `container.db.config.getModuleConfig(guildId, moduleName, key)` (not part of this SDK - `container` is globally available via `@sapphire/framework`, see any example under [`examples/`](https://github.com/lumi-devs/Lumi/blob/main/examples/)).

Also exported: `FieldType` (the enum `cfg.*` builders tag fields with), `parseConfigList` (splits a `cfg.string({ list: true })` value back into `string[]`), and the types `ModuleMeta`, `ModuleOptions`, `ConfigField`, `ModuleConfigSchema`.

### `ModuleListener` / `GuildMessageListener`

```typescript
abstract class ModuleListener<E extends keyof ClientEvents> extends Listener {
  protected abstract handle(...args: ClientEvents[E]): Awaitable<void>;
  protected resolveGuildId(...args: ClientEvents[E]): string | null; // override for events without event.guildId/event.guild.id
}
```

A Sapphire `Listener` that gates on the owning module being enabled for the guild before calling `handle()` - implement `handle`, never `run` (sealed). `GuildMessageListener` is a specialization pinned to Lumi's filtered guild-message event (bots/webhooks/system messages already excluded) - same `handle(message: GuildMessage)` contract. See [Module Creation Guide § Listeners](GUIDE_MODULE_CREATION.md#step-4-listeners).

```typescript
import { ApplyOptions } from "@sapphire/decorators";
import { Events } from "@sapphire/framework";
import { ModuleListener } from "lumi";

@ApplyOptions<ModuleListener.Options>({ name: "my-addon-join", event: Events.GuildMemberAdd, module: "my-addon" })
export default class JoinListener extends ModuleListener<typeof Events.GuildMemberAdd> {
  protected override async handle(member) { /* ... */ }
}
```

### `Service` / `getService` / `tryGetService`

```typescript
class Service extends Piece {
  get logger(): Logger;
  get db(): DatabaseService;
  get redis(): Redis;
}
function getService<K extends keyof Services>(name: K): Services[K];    // throws if not loaded
function tryGetService<K extends keyof Services>(name: K): Services[K] | undefined; // undefined if not loaded
```

Singleton business-logic classes, kept separate from the thin command/listener/handler pieces that trigger them. Register the type with declaration merging so `getService` returns it typed:

```typescript
declare module "lumi" {
  interface Services {
    "my-addon": MyAddonService;
  }
}
```

(Addons can `declare module "lumi"` for this since `Services` is re-exported from the SDK's top-level module - built-in modules do the same thing against `#lib/module-system/Service.js` internally; either path augments the same interface.)

---

## `lumi/commands`

```typescript
export { BaseCommand, BaseSubcommand, CommandContext, BucketScope, type ReplyOptions };
```

### `BaseCommand`

`extends` Sapphire's `Command`, adding:

- A single `run(ctx: CommandContext)` bridged to `chatInputRun` always, and `messageRun` if `prefixEnabled: true` is set in options. Implement `chatInputRun`/`messageRun` directly instead if you need Discord's raw interaction/message object.
- Every command automatically gets the module-enabled precondition appended.
- Builders passed to `registerApplicationCommands` get sane `setDefaultMemberPermissions`/`setContexts`/`setIntegrationTypes` defaults pre-seeded - override in the same builder chain if needed.

```typescript
@ApplyOptions<BaseCommand.Options>({ name: "hello", description: "Say hello." })
export default class HelloCommand extends BaseCommand {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((b) => b.setName(this.name).setDescription(this.description));
  }
  public override async run(ctx: CommandContext) {
    return ctx.replySuccess("Hello!", "Welcome.");
  }
}
```

### `BaseSubcommand`

Same idea for multi-subcommand commands - extend it instead of `BaseCommand` and use Sapphire's `{ run: "methodName" }` mapping; each mapped method is rewritten to receive a `CommandContext`.

### `CommandContext`

Unifies slash and prefix invocation - the object every `run(ctx)` receives:

```typescript
ctx.getString(name, { required?, rest? })   // also getInteger/getNumber/getBoolean/getUser/getMember/getRole/getChannel
ctx.reply(...)
ctx.replySuccess(title, body, opts?)
ctx.replyError(title, body, opts?)
ctx.replyWarning(title, body, opts?)
ctx.replyInfo(title, body, opts?)
ctx.fetchT()          // i18next translator for the invoking guild's locale
ctx.checkPermit(node)
ctx.isSlash            // true for slash invocation, false for prefix
ctx.user / ctx.member / ctx.guild / ctx.guildId
ctx.interaction / ctx.message  // throws if you access the wrong one for this invocation path
```

`ReplyOptions` is `{ ephemeral?: boolean }` - replies are ephemeral by default, pass `{ ephemeral: false }` to opt out.

### `BucketScope`

Re-exported from `@sapphire/framework` - the cooldown-scope enum (`User`/`Channel`/`Guild`/`Global`) for a command's `cooldownScope` option.

---

## `lumi/permissions`

```typescript
export { PermissionLevel, resolvePermissionLevel } from "...";
export { checkModulesEnabled } from "...";
export { isModuleEnabled } from "...";
```

### `PermissionLevel`

```typescript
enum PermissionLevel {
  EVERYONE = 0, USER = 1, MOD = 10, ADMIN = 20,
  GUILD_OWNER = 30, OWNER = 31, BOT_OWNER = 40,
}
```

### `resolvePermissionLevel(target): Promise<number>`

Resolves a `PermissionLevel` for an interaction/message-like object - checks bot-owner list, guild ownership, `Administrator`, then a set of moderator-shaped permissions (`ManageGuild`/`ManageRoles`/`ManageChannels`/`BanMembers`/`KickMembers`/`ManageMessages`), falling back to `USER`.

### `isModuleEnabled(guildId, moduleName): Promise<boolean>`

Point check for whether a module (built-in or addon) is enabled for a guild.

### `checkModulesEnabled(guildId, moduleNames): Promise<Map<string, boolean>>`

Batched form - coalesces concurrent lookups for the same guild within a 200ms window into one Redis round-trip. Prefer this over multiple `isModuleEnabled` calls when checking several modules at once (e.g. from a listener that fans out to multiple feature checks on the same event).

---

## `lumi/scheduling`

```typescript
export { RelayTask, shouldRunNow, DEFAULT_CATCHUP_GRACE_MS, type CatchUpMeta };
export { scheduleTask, cancelTask };
export { publishTaskFire };
export { registerTaskFireHandler };
```

Lumi's scheduled-task pieces (`@sapphire/plugin-scheduled-tasks`, BullMQ-backed) are pure *schedulers* - a piece never touches Discord directly, it republishes a "fire" event onto a Redis Stream, and whichever `worker` process consumes that stream does the actual work. See [Architecture § Redis Streams bus mechanics](architecture.md#redis-streams-bus-mechanics) for delivery guarantees (at-least-once, DLQ after 5 deliveries) and [Module Creation Guide § Scheduled tasks](GUIDE_MODULE_CREATION.md#step-7-scheduled-tasks) for the full walkthrough.

### `RelayTask<N>`

```typescript
@ApplyOptions<ScheduledTask.Options>({ name: "my-addon-cleanup", pattern: "0 * * * *" }) // hourly
export class CleanupTask extends RelayTask<"my-addon-cleanup"> {}
```

That's the whole piece for a recurring (cron) task - `RelayTask.run()` applies catch-up policy and publishes the fire for you.

### `shouldRunNow(taskName, payload, graceMs?): boolean` / `CatchUpMeta` / `DEFAULT_CATCHUP_GRACE_MS`

`CatchUpMeta` (`{ scheduledFor?: number; catchUp?: boolean }`) lets a payload opt out of running if it's overdue by more than `graceMs` (default `DEFAULT_CATCHUP_GRACE_MS` = 60,000ms) - for time-sensitive one-shots like "delete this ephemeral message after 20s", which shouldn't fire hours late after an outage. `shouldRunNow` is what `RelayTask.run()` calls internally; you only need it directly if you're not using `RelayTask`.

### `scheduleTask(name, payload, options?)` / `cancelTask(jobId)`

Schedule (or cancel) a one-shot delayed job from anywhere - role-aware (creates the BullMQ job directly if the calling process owns the scheduler role, otherwise publishes a request over the bus for the `scheduler` process). Handle the eventual fire in the module's `onLoad` via `registerTaskFireHandler`:

```typescript
// schedule
await scheduleTask("my-addon-cleanup", { targetId }, { delay: 60_000 });

// handle, in index.ts's onLoad()
registerTaskFireHandler("my-addon-cleanup", "unicast", async (payload) => {
  // Discord-touching work happens here, on whichever worker consumes it
});
```

### `registerTaskFireHandler(name, mode, handler)`

`mode` is `"unicast"` (exactly one worker instance handles each fire - use for anything that must happen exactly once, like deleting a specific message) or `"broadcast"` (every worker instance handles every fire independently - use when each process needs to react locally regardless of which one scheduled it).

### `publishTaskFire`

Lower-level primitive `RelayTask` and the scheduler process use internally to publish a fire onto the bus. Addons normally reach the fire through `registerTaskFireHandler`, not by calling this directly.

---

## `lumi/ui`

```typescript
export { makeCard, makeInfoCard, makeSuccessCard, makeWarningCard, makeErrorCard, ephemeralCard, noPingCard, resolveCardColor, defaultCardColors, type CardReply, type CardOptions, type CardColorKey };
export { confirmRow, backRow };
export { confirmPrompt, type ConfirmPromptOptions };
export { paginateList, paginateContainer };
export { Emojis };
```

Card helpers are the **required** replacement for raw `new EmbedBuilder()` - the addon linter hard-errors on `EmbedBuilder` usage.

### `make*Card(title, body, options?): CardReply`

```typescript
makeCard(title, body, options?)      // neutral/primary accent
makeInfoCard(title, body, options?)
makeSuccessCard(title, body, options?)
makeWarningCard(title, body, options?)
makeErrorCard(title, body, options?)
```

```typescript
interface CardOptions {
  subtitle?: string;
  breadcrumbs?: string[];
  statusBadge?: { status: string; label?: string };
  footer?: string;
  thumbnail?: string;
  thumbnailUrl?: string;
  divider?: boolean;
  actionRows?: ActionRowBuilder[];    // e.g. confirmRow(...) / backRow(...) below
}
```

`resolveCardColor(key)` returns a color int for the given key (`"primary"`, `"info"`, `"success"`, `"warning"`, `"error"`, `"neutral"`, `"gold"`, `"purple"`, `"cyan"`) - it checks the operator's branding overrides in `config/bot.ts` first, then falls back to the built-in palette. `defaultCardColors` is the raw object (`{ primary: 0x5865f2, info: 0x5865f2, ... }`) if you need to access the palette directly. Use `resolveCardColor` when composing a card manually instead of through a `make*Card` helper. `ephemeralCard(card)` / `noPingCard(card)` wrap an existing `CardReply` to add the ephemeral flag / suppress mention pings, respectively - useful when you built the card once and need both an ephemeral and non-ephemeral send path.

On a `CommandContext`, the equivalent one-call helpers are `ctx.replySuccess`/`replyError`/`replyWarning`/`replyInfo` (see `lumi/commands` above) - reach for `make*Card` directly only when you need the `CardReply` object itself (e.g. sending from a listener with no `CommandContext`, or building a multi-step message).

### `confirmPrompt(ctx, options): Promise<boolean>`

```typescript
interface ConfirmPromptOptions {
  title: string;
  body: string;
  confirmLabel?: string;   // default "I understand, continue"
  cancelLabel?: string;    // default "Cancel"
  time?: number;           // ms to wait for a click; default resolves false on timeout
}
```

Shows a Confirm/Cancel button prompt, resolves once the invoker clicks one (or `false` on timeout) - works uniformly across slash and prefix `CommandContext`.

### `confirmRow(options)` / `backRow(customId, label?)`

Lower-level `ActionRowBuilder<ButtonBuilder>` factories `confirmPrompt` is built on - reach for these directly when building a custom multi-button panel instead of the full prompt flow. `confirmRow({ confirmId, cancelId, confirmLabel?, cancelLabel?, confirmStyle? })` produces a Danger-confirm + Secondary-cancel pair; `backRow(customId, label = "← Back")` a single back button.

### `paginateList(options)` / `paginateContainer(options)`

```typescript
interface PaginateListOptions {
  interactionOrMessage: ChatInputCommandInteraction | Message;
  userId: string;           // only this user's clicks advance pages
  title: string;
  items: string[];
  perPage?: number;         // default 10
  ephemeral?: boolean;      // default false
  time?: number;            // default 60_000
}
```

`paginateList` is the common case - hand it an array of pre-formatted strings and it handles the Next/Prev buttons and page math. `paginateContainer` is the lower-level primitive it's built on (`{ interactionOrMessage, totalPages, userId, render: (pageIndex, container) => void }`) for when each page's content isn't a flat list of strings.

### `Emojis`

Named emoji constants used throughout the built-in UI (`Emojis.AFK`, `Emojis.GEAR`, etc. - see `packages/core/src/lib/utilities/assets.ts` for the full set), plus two helpers: `Emojis.custom(customId, fallback)` (validates a custom-emoji string, falls back to a Unicode symbol) and `Emojis.parse(emoji)` (splits a `<a?:name:id>` string into `{ name, id?, animated? }` for `ButtonBuilder.setEmoji`).

---

## `lumi/utils`

```typescript
export { BotConfig };
export { relativeTimestamp, shortTimestamp, parseDuration, formatDuration };
export { errorFrom, swallow, logError };
export { acquireRedisLock, type RedisLockOptions };
export type { GuildMessage };
```

### `BotConfig`

The merged runtime config object (bot presence, branding colors/links, UI defaults like `defaultListPerPage`) - operator-supplied overrides from `config/bot.ts` merged over Lumi's defaults. Read-only from addon code.

### Time helpers

```typescript
relativeTimestamp(date?: Date | number): string   // Discord <t:...:R> markdown
shortTimestamp(date?: Date | number): string      // Discord <t:...:d> markdown (or similar short form)
parseDuration(str: string): number | null         // "1h30m" → milliseconds, or null if unparseable
formatDuration(ms: number): string                // milliseconds → human-readable ("1h 30m")
```

### Error helpers

```typescript
errorFrom(err: unknown): Error       // normalizes any thrown value to a real Error
logError(context: string, err: unknown): void   // container.logger.error(`[${context}]`, errorFrom(err))
swallow(reason: string): (err: unknown) => null  // drop-in for .catch(() => null) that still logs at debug level
```

`somePromise.catch(swallow("MyAddon: background refresh failed"))` instead of a silent `.catch(() => null)` - failures stay visible in debug logs without crashing the caller.

### `acquireRedisLock(redis, key, options?): Promise<() => Promise<void>>`

```typescript
interface RedisLockOptions {
  ttlMs?: number;             // lock lease, auto-renewed at ttlMs/2 while held
  acquireTimeoutMs?: number;  // max wait before giving up
}
```

Distributed lock over `container.redis` (or any `Redis` instance) - resolves to a release function once acquired, throws/rejects on timeout. Use for cross-process mutual exclusion (e.g. "only one worker should run this cleanup at a time").

### `GuildMessage`

Type-only export - the message shape `GuildMessageListener.handle()` receives (Lumi's filtered `messageCreate`, bots/webhooks/system messages already excluded).

---

## What's deliberately not exported

- **`container.prisma` / any Prisma model type.** Addons get no database schema of their own - persist through `container.db.guildKV` (generic per-guild key/value store) or `container.redis`. See [Addon Publishing Guide](GUIDE_ADDON_PUBLISHING.md#addon-specific-rules).
- **`DatabaseService` methods beyond `guildKV`.** The full repository facade (`container.db.afk`, `container.db.moderation`, etc.) is for built-in modules with dedicated Prisma tables.
- **`stores.registerPath`.** The Downloader already registers an addon's path; calling it yourself is a linter warning.
- **Raw `EmbedBuilder`.** Use the card helpers in `lumi/ui` - this is a hard lint error, not a warning.

