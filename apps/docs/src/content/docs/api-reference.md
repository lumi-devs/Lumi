---
title: "Addon SDK API Reference"
description: "Every export of the addon SDK - the addon-facing API surface."
category: "Addon SDK"
---

# Addon SDK API Reference

The public, stable surface for addon code comprises `@lumi` and its subpaths. Addons must only import from these entry points. Internal paths (`#lib/*`, `#utilities/*`, `#database/*`) are private implementation details, and the addon validator treats direct internal imports as errors.

For implementation walkthroughs, see [Quick Start: Your First Addon](/guides/quick-start-addon) and the [Module Creation Guide](/guides/module-creation). For publishing requirements and manifest rules, consult the [Addon Publishing Guide](/guides/addon-publishing).

```typescript
import { Module, DefineModule, cfg, Utility, getUtility, NoEndUserData } from "lumi";
import { BaseCommand, BaseSubcommand, CommandContext } from "lumi/commands";
import { hasRequiredPermit, isModuleEnabled, checkModulesEnabled } from "lumi/permissions";
import { scheduleTask, RelayTask, registerTaskFireHandler } from "lumi/scheduling";
import { makeSuccessCard, Emojis, confirmPrompt, paginateList } from "lumi/ui";
import { BotConfig, relativeTimestamp, parseDuration } from "lumi/utils";
```

Source: `packages/core/src/lib/addon-sdk/{index,commands,permissions,scheduling,ui,utils}.ts`.

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

Base class for a module/addon's entrypoint class. Extends Sapphire's `Piece`. Implement `deleteUserData` and `exportUserData` if the addon stores anything keyed by a user ID (GDPR). See [Module Creation Guide § Lifecycle hooks](/guides/module-creation#lifecycle-hooks) for when each hook fires.

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

A Sapphire `Listener` that gates on the owning module being enabled for the guild before calling `handle()` - implement `handle`, never `run` (sealed). `GuildMessageListener` is a specialization pinned to Lumi's filtered guild-message event (bots/webhooks/system messages already excluded) - same `handle(message: GuildMessage)` contract. See [Module Creation Guide § Listeners](/guides/module-creation#step-4-listeners).

```typescript
import { ApplyOptions } from "@sapphire/decorators";
import { Events } from "@sapphire/framework";
import { ModuleListener } from "lumi";

@ApplyOptions<ModuleListener.Options>({ name: "my-addon-join", event: Events.GuildMemberAdd, module: "my-addon" })
export default class JoinListener extends ModuleListener<typeof Events.GuildMemberAdd> {
  protected override async handle(member) { /* ... */ }
}
```

### `Utility` / `getUtility` / `tryGetUtility`

```typescript
class Utility extends Piece {
  get logger(): Logger;
  get db(): DatabaseService;
  get redis(): Redis;
}
function getUtility<K extends keyof Utilities>(name: K): Utilities[K];    // throws if not loaded
function tryGetUtility<K extends keyof Utilities>(name: K): Utilities[K] | undefined; // undefined if not loaded
```

Singleton business-logic classes, kept separate from the thin command/listener/handler pieces that trigger them. Register the type with declaration merging so `getUtility` returns it typed:

```typescript
declare module "lumi" {
  interface Utilities {
    "my-addon": MyAddonUtility;
  }
}
```

Addons declare interface augmentations on `"lumi"` to provide static typing for custom utilities.

---

## `lumi/commands`

```typescript
export {
  BaseCommand,
  BaseSubcommand,
  CommandContext,
  BucketScope,
  sendReply,
  replySuccess,
  replyError,
  replyWarning,
  replyInfo,
  assertPermit,
  type ReplyOptions,
  type CommandReplyTarget,
};
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

Extend `BaseSubcommand` for multi-level commands. Sapphire's `{ run: "methodName" }` mappings automatically provide a `CommandContext` to each subcommand handler.

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
export { hasRequiredPermit, checkModulesEnabled, isModuleEnabled };
```

### `hasRequiredPermit(target, permitNode): Promise<boolean>`

Checks whether an interaction/message-like object satisfies a granular permit node - bot-owner and guild-owner always pass, otherwise it consults `PermitResolver` (the same permit/deny rule set and anti-nuke quarantine check that command pieces get via `RequirePermitPrecondition`). Use this for interaction handlers, which never run through that precondition.

### `isModuleEnabled(guildId, moduleName): Promise<boolean>`

Point check for whether a module (built-in or addon) is enabled for a guild.

### `checkModulesEnabled(guildId, moduleNames): Promise<Map<string, boolean>>`

Batched form - coalesces concurrent lookups for the same guild within a 200ms window into one Redis round-trip. Prefer this over multiple `isModuleEnabled` calls when checking several modules at once (e.g. from a listener that fans out to multiple feature checks on the same event).

---

## `lumi/scheduling`

```typescript
export { RelayTask, shouldRunNow, DefaultCatchupGraceMs, type CatchUpMeta };
export { scheduleTask, cancelTask };
export { publishTaskFire };
export { registerTaskFireHandler };
```

Lumi's scheduled-task pieces (`@sapphire/plugin-scheduled-tasks`, BullMQ-backed) are pure schedulers. A piece never touches Discord directly; it republishes a fire event onto a Redis Stream, and worker consumer groups process the actual execution. See [Architecture § Redis Streams Bus Mechanics](/architecture#redis-streams-bus-mechanics) for delivery guarantees and [Module Creation Guide § Scheduled Tasks](/guides/module-creation#step-7-scheduled-tasks) for walkthroughs.

### `RelayTask<N>`

```typescript
@ApplyOptions<ScheduledTask.Options>({ name: "my-addon-cleanup", pattern: "0 * * * *" }) // hourly
export class CleanupTask extends RelayTask<"my-addon-cleanup"> {}
```

Recurring cron task base class. `RelayTask.run()` applies catch-up policy and publishes the task fire event over the bus.

### `shouldRunNow(taskName, payload, graceMs?): boolean` / `CatchUpMeta` / `DefaultCatchupGraceMs`

`CatchUpMeta` (`{ scheduledFor?: number; catchUp?: boolean }`) lets a payload opt out of running if it's overdue by more than `graceMs` (default `DefaultCatchupGraceMs` = 60,000ms). This prevents stale one-shots from firing long after downtime. `shouldRunNow` is what `RelayTask.run()` evaluates internally.

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

Card helpers in `lumi/ui` are the standard interface for rich replies. The addon validator blocks direct instantiation of `EmbedBuilder`.

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

- **`resolveCardColor(key)`**: Returns the RGB integer for keys (`"primary"`, `"info"`, `"success"`, `"warning"`, `"error"`, `"neutral"`, `"gold"`, `"purple"`, `"cyan"`), prioritizing branding overrides in `config/bot.ts`.
- **`defaultCardColors`**: Direct map of default palette hex values.
- **`ephemeralCard(card)` / `noPingCard(card)`**: Wraps a `CardReply` to mark it ephemeral or suppress user mentions.

On a `CommandContext`, the equivalent one-call helpers are `ctx.replySuccess`/`replyError`/`replyWarning`/`replyInfo` (see `lumi/commands` above). Use `make*Card` directly when building multi-step components or sending from standalone listeners.

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
export { acquireRedisLock, verifyRedisLock, type RedisLock, type RedisLockOptions };
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

### `acquireRedisLock(redis, key, options?): Promise<RedisLock>`

```typescript
interface RedisLockOptions {
  ttlMs?: number;             // lock lease, auto-renewed at ttlMs/2 while held
  acquireTimeoutMs?: number;  // max wait before giving up
}

interface RedisLock {
  release: () => Promise<void>;
  token: string;
}
```

Distributed lock over `container.redis` (or any `Redis` instance). Resolves to a `RedisLock` with auto-renewal and release function. Use for cluster-wide mutual exclusion.

### `GuildMessage`

Type-only export - the message shape `GuildMessageListener.handle()` receives (Lumi's filtered `messageCreate`, bots/webhooks/system messages already excluded).

---

## What's deliberately not exported

- **`container.prisma` / any Prisma model type.** Addons get no database schema of their own - persist through `container.db.guildKV` (generic per-guild key/value store) or `container.redis`. See [Addon Publishing Guide](/guides/addon-publishing#addon-development-rules).
- **`DatabaseService` methods beyond `guildKV`.** The full repository facade (`container.db.afk`, `container.db.moderation`, etc.) is for built-in modules with dedicated Prisma tables.
- **`stores.registerPath`.** The Downloader already registers an addon's path; calling it yourself is a linter warning.
- **Raw `EmbedBuilder`.** Use the card helpers in `lumi/ui` - this is a hard lint error, not a warning.

