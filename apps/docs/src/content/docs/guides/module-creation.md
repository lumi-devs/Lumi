---
title: "Module Creation Guide"
description: "Step-by-step module creation walkthrough built around the real afk module."
category: "Addon SDK"
---

# Module Creation Guide

This guide walks through building a Lumi module end-to-end, using the real `afk` module as a running example. It touches every extension point: configuration schema, utilities, commands, gated listeners, interaction handlers, and scheduled tasks.

## Prerequisites

- Complete setup as described in the repository's root `README.md`.
- Review the architectural specifications in `AGENTS.md`.

---

## Directory Structure

Create a directory under `packages/core/src/modules/<your-module>/`. Sapphire sub-stores are discovered automatically:

```
packages/core/src/modules/<your-module>/
  index.ts                    # Module entrypoint - @DefineModule decorator, lifecycle hooks
  manifest.json               # Generated via bun run modules:manifest
  commands/                   # Commands extending BaseCommand or BaseSubcommand
  listeners/                  # Event listeners extending ModuleListener or GuildMessageListener
  utilities/                  # Singleton business-logic utilities extending Utility
  interaction-handlers/       # Button, select-menu, and modal handlers
  scheduled-tasks/            # BullMQ-backed scheduled tasks extending RelayTask
  lib/                        # Internal helper utilities
```

---

## Step 1: Define Module Metadata

`packages/core/src/modules/<your-module>/index.ts`:

```typescript
import { DefineModule, Module, cfg, NoEndUserData } from "#core/module-system/Module.js";
import { Emojis } from "#utilities/assets.js";

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
  endUserDataStatement: NoEndUserData(),
})
export class MyModule extends Module {
  public override async deleteUserData(userId: string): Promise<void> {
    // If the module persists user-keyed rows, delete them here.
  }
}
```

`ModuleOptions` fields:

```typescript
interface ModuleOptions extends Piece.Options {
  name?: string;
  displayName?: string;
  emoji?: string;
  description?: string;
  version?: string;
  conflicts?: string[];             // Module names this module cannot run alongside
  dependencies?: string[];          // Modules that must be enabled first
  configSchema?: ModuleConfigSchema;// Built via cfg.object(...)
  configFields?: ConfigField[];     // Low-level alternative to configSchema
  configOverrides?: boolean;         // Allow per-channel/role overrides (default true)
  disableable?: boolean;             // Can this module be disabled? (default true)
  endUserDataStatement?: string;     // GDPR statement or NoEndUserData()
}
```

### Lifecycle Hooks

| Hook | When it runs | Default |
| :--- | :--- | :--- |
| `onLoad()` | Module (or containing process) loads. Registers scheduled task handlers and initializes state. | Calls `super.onLoad()` |
| `onUnload()` | Module is disabled or unloaded. | Calls `super.onUnload()` |
| `deleteUserData(userId, requester?)` | Scrubs user data during GDPR erasure. | No-op |
| `exportUserData(userId)` | Returns user data during GDPR export requests. | Returns `null` |
| `reconcileScheduledJobs()` | Re-arms delayed or recurring jobs on startup. | No-op |

---

## Step 2: Configuration Schema

Config fields are constructed using `cfg.*` from `#core/module-system/Module.js`:

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

Available field builders:
- `cfg.boolean({ default })`: Boolean toggle.
- `cfg.number({ default, min, max })`: Numeric input with min/max bounds.
- `cfg.string({ default, list })`: Text input (`list: true` parses comma-separated lists into `string[]`).
- `cfg.enum(choices, { default })`: Select dropdown.
- `cfg.channel({ default, channelTypes })`: Snowflake channel picker.
- `cfg.role({ default })`: Snowflake role picker.
- `cfg.user({ default })`: Snowflake user picker.

---

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

`CommandContext` methods:
- `ctx.replySuccess(title, description, options?)`
- `ctx.replyError(title, description, options?)`
- `ctx.replyWarning(title, description, options?)`
- `ctx.replyInfo(title, description, options?)`
- `ctx.getString(name, options?)`, `ctx.getInteger()`, `ctx.getBoolean()`, `ctx.getUser()`, `ctx.getRole()`, `ctx.getChannel()`
- `ctx.fetchT()`: Resolves the i18next translator for the guild's configured locale.

---

## Step 4: Listeners

Extend `ModuleListener` to automatically gate execution on the module being enabled:

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
    // Executes only when my_module is enabled in member.guild
  }
}
```

For filtered user messages (excluding bots, webhooks, and system messages), extend `GuildMessageListener`:

```typescript
import { ApplyOptions } from "@sapphire/decorators";
import { GuildMessageListener } from "#core/module-system/GuildMessageListener.js";
import type { GuildMessage } from "#lib/types.js";

@ApplyOptions<GuildMessageListener.Options>({
  name: "my-module-message",
  module: "my_module",
})
export default class MessageListener extends GuildMessageListener {
  protected override async handle(message: GuildMessage) {
    // Process filtered user message
  }
}
```

---

## Step 5: Utilities

Utilities encapsulate business logic:

```typescript
import { ApplyOptions } from "@sapphire/decorators";
import type { Piece } from "@sapphire/framework";
import { Utility } from "#core/module-system/Utility.js";

@ApplyOptions<Piece.Options>({ name: "my_module" })
export default class MyUtility extends Utility {
  public async executeAction(guildId: string) {
    // Access this.db, this.redis, this.logger
  }
}

declare module "#core/module-system/Utility.js" {
  interface Utilities {
    my_module: MyUtility;
  }
}
```

Access utilities anywhere:

```typescript
import { getUtility, tryGetUtility } from "#core/module-system/Utility.js";

const utility = getUtility("my_module");
```

---

## Step 6: Interaction Handlers

Handle buttons, select menus, and modals:

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
    this.checkSecurity(interaction, targetId);
    await this.acknowledge(interaction);
  }
}
```

---

## Step 7: Scheduled Tasks

Scheduled tasks decouple time triggers (BullMQ on Shard 0) from execution (Redis Streams on worker shards).

**Recurring (Cron) Task**:

```typescript
import { ApplyOptions } from "@sapphire/decorators";
import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { RelayTask, type CatchUpMeta } from "#lib/scheduled-tasks.js";

export interface CleanupPayload extends CatchUpMeta {}

@ApplyOptions<ScheduledTask.Options>({
  name: "my-module-cleanup",
  pattern: "0 * * * *", // Hourly
})
export class CleanupTask extends RelayTask<"my-module-cleanup"> {}

declare module "@sapphire/plugin-scheduled-tasks" {
  interface ScheduledTasks {
    "my-module-cleanup": CleanupPayload;
  }
}
```

**Task Execution Handler** (`index.ts`):

```typescript
import { registerTaskFireHandler } from "#lib/task-fire-registry.js";

export class MyModule extends Module {
  public override onLoad() {
    registerTaskFireHandler("my-module-cleanup", "unicast", async (payload) => {
      // Execute the scheduled task logic
    });
    return super.onLoad();
  }
}
```

---

## Step 8: Database & Persistence

- **Built-in Modules**: Use dedicated repositories under `packages/core/src/lib/prisma/repositories/` and access them via `container.db.<repo>`.
- **Addons & Dynamic Data**: Use `container.db.guildKV`:
  ```typescript
  await container.db.guildKV.setModuleData(guildId, "my_module", targetId, "key", data);
  const data = await container.db.guildKV.getModuleData(guildId, "my_module", targetId, "key");
  ```
- **Cache Invalidation**: Use `container.invalidation.invalidate(...)` instead of direct `redis.del`.

---

## Step 9: Translations

Create `packages/core/src/languages/en-US/<module>.json`:

```json
{
  "greet": "Hello, {{user}}!"
}
```

Fetch in code:

```typescript
const t = await ctx.fetchT();
await ctx.replyInfo(t("greet", { user: ctx.user.username }));
```

---

## Step 10: Generate Manifests

Whenever you modify `@DefineModule` metadata, generate the static manifest:

```bash
bun run modules:manifest
```

---

## Step 11: Testing & Verification

```bash
bun run typecheck
bun run lint
bun run test
```


