---
title: "Module Creation Guide"
description: "Step-by-step module creation walkthrough built around the real afk module."
---

This guide walks through building a Lumi module end-to-end, using the real `afk` module as a running example - it's small enough to read in full but touches every extension point: config, a service, a command, a gated listener, an interaction handler, and a scheduled task.

## Prerequisites

- Complete setup as described in [CONTRIBUTING.md](https://github.com/lumi-devs/Lumi/blob/main/CONTRIBUTING.md).
- Read the rules in [AGENTS.md](https://github.com/lumi-devs/Lumi/blob/main/AGENTS.md) - the "Rules" section at the bottom of this guide summarizes the ones that matter most for day-to-day module work, but AGENTS.md is the source of truth.

## Directory structure

Create a directory under `packages/core/src/modules/<your-module>/`. Every subfolder is a Sapphire "sub-store"; only create the ones you need:

```
packages/core/src/modules/<your-module>/
  index.ts                # Module entrypoint - @DefineModule decorator, lifecycle hooks
  manifest.json            # Generated - do not hand-edit (see Step 7)
  commands/                 # Slash/prefix commands extending BaseCommand
  listeners/                 # Event listeners extending ModuleListener / GuildMessageListener
  services/                   # Singleton services extending Service
  interaction-handlers/        # Button/select/modal handlers
  scheduled-tasks/               # BullMQ-backed tasks extending RelayTask
  preconditions/                  # Custom Sapphire preconditions, if needed
  routes/                          # Dashboard-facing routes, if needed
  lib/                              # Internal helpers, not exported outside the module
```

## Step 1: Define module metadata

`packages/core/src/modules/<your-module>/index.ts`:

```typescript
import { DefineModule, Module, cfg } from "#core/module-system/Module.js";
import { Emojis } from "#lib/utilities/assets.js";

@DefineModule({
  name: "my_module",
  displayName: "My Module",
  emoji: Emojis.GEAR,
  version: "1.0.0",
  description: "What this module does.",
  configSchema: cfg.object({
    some_setting: cfg.boolean({
      label: "Some Setting",
      description: "What toggling this does.",
      default: true,
    }),
  }),
})
export class MyModule extends Module {}
```

`Module` extends Sapphire's `Piece`, so it's a normal store-registered piece, not a bespoke system. `@DefineModule` stamps a static `meta` object onto the class describing name, display info, and config - this metadata is what powers manifest generation (Step 7) and the dashboard/config panel, independent of whether the module's code has actually been imported yet.

`ModuleOptions` in full:

```typescript
interface ModuleOptions extends Piece.Options {
  name?: string;
  displayName?: string;
  emoji?: string;
  description?: string;
  version?: string;
  conflicts?: string[];        // names of modules this one can't run alongside
  dependencies?: string[];     // names of modules that must be enabled first
  configFields?: ConfigField[]; // low-level alternative to configSchema
  configSchema?: ModuleConfigSchema;
  configOverrides?: boolean;    // allow per-guild overrides of config? default true
  disableable?: boolean;        // can this module ever be turned off? default true
}
```

There is no `defaultEnabled` option - every module defaults to enabled at runtime (`ModuleStore` falls back to `true` unless a database row says otherwise). There is also no module-level `group`/category field; grouping only applies to individual config fields (Step 2), not to modules as a whole.

### Lifecycle hooks

| Hook | When it runs | Default |
| :--- | :--- | :--- |
| `onLoad()` | Module (or its containing process) starts. Also fires `reconcileScheduledJobs()` fire-and-forget. | calls `super.onLoad()` |
| `onUnload()` | Module is unloaded/disabled. | calls `super.onUnload()` |
| `deleteUserData(userId, requester?)` | Scrubs the module's own data for a user during GDPR erasure. Invoked by `executeGdprDeletion` (`#lib/gdpr.js`) for every loaded module. | no-op |
| `exportUserData(userId)` | Returns the module's own data for a user during a GDPR export request, or `null` if it has none. Invoked by `executeGdprExport` (`#lib/gdpr.js`). | returns `null` |
| `reconcileScheduledJobs()` | Called from `onLoad`; re-arm any delayed jobs that should exist after a restart. | no-op |

## Step 2: Configuration schema

Config fields are built with `cfg.*` from `#core/module-system/Module.js`, backed by `@sapphire/shapeshift`. Every field (except `cfg.object`, the schema wrapper) shares a base set of options:

```typescript
interface BaseOpts {
  label: string;
  description: string;
  required?: boolean;
  group?: string; // panel subsection this field renders under
}
```

Available field types:

| Builder | Extra options | Renders as |
| :--- | :--- | :--- |
| `cfg.boolean({ default })` | | Toggle / checkbox |
| `cfg.number({ default, min, max })` | `min`/`max` become range validation | Number input |
| `cfg.string({ default, list })` | `list: true` stores a comma-separated string, exposed as `string[]` | Text input (opens a modal in the Discord panel) |
| `cfg.enum(choices, { default })` | `choices` is a `const` tuple, e.g. `["low", "medium", "high"] as const` | Select dropdown |
| `cfg.channel({ default, channelTypes })` | Validated as a snowflake, not resolved to a live channel object | Channel picker (Discord ID input) |
| `cfg.role({ default })` | Snowflake-validated | Role picker |
| `cfg.user({ default })` | Snowflake-validated | User picker |

**Use `group` on every field once a module has more than a handful of settings.** Fields sharing a `group` render together as a navigable subsection instead of one flat scroll - `filter` and `security` (the two largest built-in modules) group into sections like "Terms & Patterns", "Invites & Links", "Anti-Nuke", "Join Gate", "Verification", "Panic Mode". Small modules (like `afk`, with a single field) can omit `group` entirely.

```typescript
configSchema: cfg.object({
  log_channel_id: cfg.channel({
    label: "Log Channel",
    description: "Where moderation actions are posted.",
    group: "Logging",
  }),
  warn_threshold: cfg.number({
    label: "Auto-Action Threshold",
    description: "Warnings before an automatic action fires.",
    default: 3,
    min: 1,
    max: 20,
    group: "Thresholds",
  }),
})
```

Validation flow when a value is set: `ConfigService.setConfig` looks up the field by key, coerces the raw string input to the field's type, re-parses it through the original shapeshift schema, then runs any registered custom validator for `<module>:<key>` - all inside a per-guild config lock.

## Step 3: Commands

`packages/core/src/modules/<your-module>/commands/hello.ts`:

```typescript
import { ApplyOptions } from "@sapphire/decorators";
import type { Command } from "@sapphire/framework";
import { BaseCommand, type CommandContext } from "#lib/commands.js";

@ApplyOptions<BaseCommand.Options>({
  name: "hello",
  description: "Say hello.",
  cooldownDelay: 5_000,
})
export default class HelloCommand extends BaseCommand {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder.setName(this.name).setDescription(this.description),
    );
  }

  public override async run(ctx: CommandContext) {
    return ctx.replySuccess("Hello!", "Welcome to my module.");
  }
}
```

`BaseCommand extends Command` (Sapphire) and adds:

- **A single `run(ctx: CommandContext)` handler** that's automatically bridged to `chatInputRun` (always) and `messageRun` (only if `prefixEnabled: true` is set in options). You can still implement `chatInputRun`/`messageRun` directly instead of `run` if you need Discord's raw interaction/message object.
- Every command automatically gets the `ModuleEnabled` precondition appended, gating execution on the owning module being enabled for the guild - you don't add this yourself.
- If `requiredPermit` is set, the `RequirePermit` precondition is appended too, and `defaultMemberPermissions` is auto-derived from the permit prefix (`admin*` → `ManageGuild`, `mod*` → `ManageMessages`).
- Builders passed to `registerApplicationCommands` get `setDefaultMemberPermissions` / `setContexts` / `setIntegrationTypes` pre-seeded for you (`shadowRegistrationDefaults`) - you can still override them explicitly in the same builder chain if a command needs different defaults.

`CommandContext` (the object `run` receives) unifies slash and prefix invocation:

```typescript
ctx.getString(name, { required?, rest? })   // also getInteger/getNumber/getBoolean/getUser/getMember/getRole/getChannel
ctx.reply(...) / ctx.replySuccess(title, body, opts?) / ctx.replyError(...) / ctx.replyWarning(...) / ctx.replyInfo(...)
ctx.fetchT()          // translator for the invoking guild's locale
ctx.checkPermit(node)
ctx.isSlash            // true for slash invocation, false for prefix
ctx.user / ctx.member / ctx.guild / ctx.guildId
ctx.interaction / ctx.message  // throws if you access the wrong one for this invocation path
```

Reply helpers are also importable directly for use outside a `CommandContext` (e.g. inside a service): `replySuccess`, `replyError`, `replyWarning`, `replyInfo` from `#lib/commands.js`, each `(interaction, title, body, { ephemeral? }) => Promise<void>`, ephemeral by default.

For commands with subcommands, extend `BaseSubcommand` (from the same file) instead - it supports Sapphire's `{ run: "methodName" }` mapping syntax, rewritten under the hood into `chatInputRun`/`messageRun` wrappers bound to `CommandContext` the same way.

## Step 4: Listeners

Use `ModuleListener` instead of a raw Sapphire `Listener` whenever a listener should only fire while its owning module is enabled - which is nearly always, for guild-scoped events.

`packages/core/src/modules/<your-module>/listeners/greet.ts`:

```typescript
import { ApplyOptions } from "@sapphire/decorators";
import { Events } from "@sapphire/framework";
import type { GuildMember } from "discord.js";
import { ModuleListener } from "#core/module-system/ModuleListener.js";

@ApplyOptions<ModuleListener.Options>({
  name: "my-module-greet",
  event: Events.GuildMemberAdd,
  module: "my_module",
})
export default class GreetListener extends ModuleListener<typeof Events.GuildMemberAdd> {
  protected override async handle(member: GuildMember) {
    // handle the join
  }
}
```

Implement `handle(...)`, not `run(...)` - `ModuleListener.run()` is sealed by the base class. It extracts the guild ID generically from the first event argument, bails immediately if there's no guild, checks `isModuleEnabled(guildId, module)`, and only then calls your `handle`. This makes module-gating structural instead of something every listener has to hand-roll.

For handling Lumi's own filtered guild-message event (already excludes bots/webhooks/system messages) rather than raw `messageCreate`, extend `GuildMessageListener` instead - same `handle()` contract, pinned to `LumiEvents.GuildUserMessage`:

```typescript
@ApplyOptions<GuildMessageListener.Options>({ name: "my-module-message", module: "my_module" })
export default class MyMessageListener extends GuildMessageListener {
  protected override async handle(message: GuildMessage) { /* ... */ }
}
```

## Step 5: Services

A service is a singleton where a module's actual business logic lives, kept separate from the thin command/listener/handler pieces that trigger it.

`packages/core/src/modules/<your-module>/services/MyService.ts`:

```typescript
import { ApplyOptions } from "@sapphire/decorators";
import type { Piece } from "@sapphire/framework";
import { Service } from "#core/module-system/Service.js";

@ApplyOptions<Piece.Options>({ name: "my_module" })
export default class MyService extends Service {
  public async doSomething(guildId: string) {
    // this.db, this.redis, this.logger are available from the base class
  }
}

declare module "#lib/module-system/Service.js" {
  interface Services {
    my_module: MyService;
  }
}
```

The `declare module` block is required - it's what makes `getService("my_module")` return a fully-typed `MyService` elsewhere via TypeScript declaration merging. Access it from a command, listener, or handler with:

```typescript
import { getService, tryGetService } from "#core/module-system/Service.js";

const service = getService("my_module");       // throws if not loaded
const maybe = tryGetService("my_module");        // undefined if not loaded - use when the owning module might be disabled
```

## Step 6: Interaction handlers

Button, select-menu, and modal handlers follow a consistent `parse` / `run` two-phase contract (standard Sapphire `InteractionHandler`), routed by a colon-delimited `customId` prefix your module owns:

`packages/core/src/modules/<your-module>/interaction-handlers/confirm.ts`:

```typescript
import { ApplyOptions } from "@sapphire/decorators";
import { InteractionHandler, InteractionHandlerTypes } from "@sapphire/framework";
import type { ButtonInteraction } from "discord.js";
import { BaseInteractionHandler } from "#lib/interaction-handler.js";

@ApplyOptions<InteractionHandler.Options>({
  interactionHandlerType: InteractionHandlerTypes.Button,
})
export default class ConfirmHandler extends BaseInteractionHandler {
  public override parse(interaction: ButtonInteraction) {
    if (!interaction.customId.startsWith("my_module:confirm:")) return this.none();
    const [, , targetId] = interaction.customId.split(":");
    return this.some({ targetId });
  }

  public async run(interaction: ButtonInteraction, { targetId }: { targetId: string }) {
    this.checkSecurity(interaction, targetId); // throws if the clicker isn't the owner
    await this.acknowledge(interaction);        // deferUpdate() if not already replied/deferred
    // ...
  }
}
```

`BaseInteractionHandler` (`#lib/interaction-handler.js`) adds two conveniences over the raw Sapphire `InteractionHandler`: `checkSecurity(interaction, ownerId)` (throws an `AccessDenied` UserError unless the clicking user matches `ownerId`) and `acknowledge(interaction)` (calls `deferUpdate()` if the interaction isn't already replied/deferred). Neither is mandatory - some handlers in the codebase extend the raw Sapphire `InteractionHandler` directly when they need finer control, most commonly modal handlers, since **`showModal()` must be the interaction's very first response** - if you call `acknowledge()` (or anything else that defers) before `showModal()`, Discord will reject it.

`customId` conventions to follow: prefix with your module name, then an action, then any IDs the handler needs to route on - e.g. `afk:mentions:<userId>:<page>`, `wt:<subAction>:<count>:<action>:<duration>`. The handler parses its own IDs back out in `parse()`; there's no shared router.

## Step 7: Scheduled tasks

Lumi uses `@sapphire/plugin-scheduled-tasks` (BullMQ-backed) purely as a *scheduler*, not an executor. A scheduled-task piece never touches Discord directly - it republishes a "fire" event onto a Redis Stream, and a `worker` process consumes that stream and does the actual work. This split exists because the process that scheduled a job (which could be `scheduler` or `worker`) isn't necessarily the process that should carry it out.

**Recurring (cron)** - `packages/core/src/modules/<your-module>/scheduled-tasks/cleanup.ts`:

```typescript
import { ApplyOptions } from "@sapphire/decorators";
import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { RelayTask, type CatchUpMeta } from "#lib/scheduled-tasks.js";

export interface CleanupPayload extends CatchUpMeta {}

@ApplyOptions<ScheduledTask.Options>({ name: "my-module-cleanup", pattern: "0 * * * *" }) // hourly
export class CleanupTask extends RelayTask<"my-module-cleanup"> {}

declare module "@sapphire/plugin-scheduled-tasks" {
  interface ScheduledTasks {
    "my-module-cleanup": CleanupPayload;
  }
}
```

That's the whole piece - `RelayTask.run()` handles catch-up policy and publishing for you. `CatchUpMeta` (`{ scheduledFor?, catchUp? }`) lets a payload opt out of running if it's overdue by more than the default 60s grace window - important for anything time-sensitive, like "delete this ephemeral message after 20s", which shouldn't fire hours late after a worker outage.

**One-shot (delayed)** - schedule from anywhere with `scheduleTask`, handle the fire in your module's `onLoad`:

```typescript
// lib/helpers.ts
import { scheduleTask } from "#lib/schedule-task.js";

await scheduleTask("my-module-cleanup", { targetId }, { delay: 60_000 });

// index.ts
import { registerTaskFireHandler } from "#lib/task-fire-registry.js";

export class MyModule extends Module {
  public override onLoad() {
    registerTaskFireHandler("my-module-cleanup", "unicast", async (payload) => {
      // do the actual Discord-touching work here, on whichever worker consumes it
    });
    return super.onLoad();
  }
}
```

`registerTaskFireHandler(name, mode, handler)` - `mode` matters:
- `"unicast"`: exactly one worker instance handles each fire (shared consumer group across all workers). Use this for anything with a side effect that must happen exactly once, like deleting a specific message.
- `"broadcast"`: every worker instance gets its own consumer group and handles every fire independently. Use this when each shard/process needs to react locally regardless of which one scheduled it.

`scheduleTask` is role-aware: if the calling process owns the scheduler role, it creates the BullMQ job directly; otherwise it publishes a request onto the bus for the `scheduler` process to pick up. You never need to branch on role yourself.

## Step 8: Database & persistence

**All data access goes through `container.db`** (`DatabaseService`) - never `container.prisma` directly. This is an enforced rule (AGENTS.md §6.1), not a style preference: `container.db` is a facade over per-domain repositories that each own their own cache-aside logic and Redis invalidation, and bypassing it means your reads/writes silently skip that caching layer.

**Built-in modules with real data needs get a dedicated Prisma model + repository** under `packages/core/src/lib/prisma/repositories/` - see `AfkRepository`, `TempVcRepository`, `ModerationRepository`, `SecurityRepository` for the pattern. This is the right choice for a first-party module going into this repo, since you can ship a Prisma migration alongside it.

**Third-party addons** (and any module that genuinely doesn't warrant its own table) use the generic KV store instead, since addons can't run migrations against the core schema:

```typescript
await container.db.guildKV.setModuleData(guildId, "my_module", targetId, "some_key", value);
const value = await container.db.guildKV.getModuleData<MyType>(guildId, "my_module", targetId, "some_key");
```

**Cache invalidation** goes through `container.invalidation.invalidate(...key)`, never a raw `container.redis.del` on a key other processes might also cache - `InvalidationBus` broadcasts the deletion over Redis pub/sub so every process's local cache stays coherent.

**GDPR**: implement `deleteUserData(userId)` and `exportUserData(userId)` on your `Module` subclass if you store per-user data - both are invoked end-to-end by the GDPR RPC flow (see Step 1).

## Step 9: Translations

Create `packages/core/src/languages/en-US/<your-module>.json`:

```json
{
  "hello": "Hello, {{user}}!",
  "goodbye": "Goodbye."
}
```

Fetch translations in code:

```typescript
const t = await ctx.fetchT();                     // inside a command, via CommandContext
const t = await fetchTyped(interaction);            // inside a listener/handler, from #lib/commands.js
await ctx.replyInfo(t("hello", { user: interaction.user.displayName }));
```

`en-US` is the fallback locale - every key must exist there at minimum. Other locales are sourced via Crowdin; untranslated keys fall back to `en-US` automatically through i18next's `fallbackLng`. Language is resolved per-guild (from the guild's configured locale), not per-user.

There is also a typed-key layer (`packages/core/src/lib/i18n/keys.ts` and `keys/`) with one file per domain, used for compile-time-checked key names in newer code - see `keys/commands/afk.ts` for the pattern if you want your module's keys typed the same way. As of this writing the per-domain tables are plain string constants (not yet wrapped in the `T()`/`FT()` helpers that would add argument-shape checking), so treat this as "typed key names" rather than "fully type-checked interpolation."

## Step 10: Generate the manifest

```bash
bun run modules:manifest
```

This walks every module directory, imports its `index.ts`, pulls the static `meta` export, detects which sub-store folders exist on disk, and writes the result to `<module-dir>/manifest.json`. The manifest lets `ModuleStore` discover a module's metadata at startup **without executing its code** - required for cheap discovery at scale and for vetting third-party addons before running them. Re-run this command every time you change anything passed to `@DefineModule` - the manifest is a build artifact that silently goes stale otherwise, and other consumers (like the dashboard) read the checked-in manifest, not live metadata.

## Step 11: Write tests

```typescript
// packages/core/tests/modules/<your-module>/<test>.test.ts
import { describe, expect, it } from "vitest";

describe("MyModule", () => {
  it("does the thing", () => {
    expect(true).toBe(true);
  });
});
```

## Step 12: Verify

```bash
bun run typecheck && bun run lint && bun run test
```

## Full example: the `afk` module

`packages/core/src/modules/afk/` demonstrates every extension point above in one place:

```
afk/
├── index.ts                          # @DefineModule, shared constants/helpers, lifecycle hooks
├── manifest.json                     # generated
├── keys.ts                           # Redis key builders + TTLs for this module
├── data/afk.ts                       # cache-aside data access (Redis + container.db.afk)
├── lib/delete-handler.ts             # the scheduled-task fire handler's actual implementation
├── services/AfkService.ts            # setAfk() state machine, cleanStaleEntries() sweep
├── commands/
│   ├── afk.ts                        # /afk - set yourself AFK
│   ├── afkclean.ts                   # admin: purge stale AFK entries
│   ├── afklist.ts                    # list AFK members
│   └── afkstats.ts                   # stats
├── listeners/messageCreate.ts        # GuildMessageListener: clears AFK, notifies mentions
├── interaction-handlers/mentions.ts  # Button: paginated "view mentions" list
└── scheduled-tasks/afkDeleteMessage.ts  # RelayTask: schedules its own cleanup-message deletion
```

Read `index.ts` first, then follow the command → service → data → scheduled-task chain from `commands/afk.ts`. It's a complete, working reference for the exact patterns in this guide.

## Rules

- **No cross-module imports.** A feature module must never `import` code directly from a sibling module (`import { X } from "../other_module/service.js"` is forbidden). Shared code belongs in `#lib/*`, `#database/*`, or `#utilities/*`. Cross-module communication goes through shared services or the container's event bus, not direct imports.
- **No raw `EmbedBuilder`.** Use the card helpers - `makeInfoCard`, `makeSuccessCard`, `makeErrorCard`, `makeWarningCard` from `#utilities/cards.js`, or the `reply*` helpers from `#lib/commands.js`.
- **No direct `container.prisma`.** Use `container.db.<repo>.<method>` (Step 8).
- **Built-in modules use dedicated Prisma tables, not the KV store.** The generic `container.db.guildKV` store is reserved for third-party addons that can't ship a migration (Step 8).
- **No direct `redis.del` on shared keys.** Use `container.invalidation.invalidate(...)` so other processes' caches invalidate too.
- **Register every Redis key in `RedisKeys`** (`#database/redis.js`) rather than inlining ad-hoc key strings.
- **Use `#` import aliases** (`#lib/*`, `#core/*`, `#database/*`, `#utilities/*`) with an explicit `.js` extension, even though the source is TypeScript - Node's ESM subpath-imports resolve statically against the alias map and don't rewrite extensions.
- **Cross-package imports use `@lumi/*` specifiers**, never relative paths across a package boundary (e.g. no `../../packages/core` from an app).
- **No panels with more than 5 action rows.** Discord's own limit. Use the panel-kit builders (`settingRow`, `thumbRow`, `tabRow`, `confirmRow`, `backRow`, `createPaginationRow` from `#utilities/panels.js`) for admin UI, and split an overgrown view into a subpanel rather than trying to cram more rows in.
- **No `as any` / `as unknown as X`.** Use type guards, `unknown`, or `@sapphire/shapeshift` validators instead.

