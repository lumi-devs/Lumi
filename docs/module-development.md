# Lumi Module Development Guide

> Comprehensive step-by-step developer guide for building built-in modules and third-party addons for Lumi-TS following Skyra and Red-DiscordBot open reference standards.

---

## 📖 Directory Structure & Sapphire Piece Paradigm

Every Lumi module is a self-contained feature unit located in `packages/core/src/modules/<name>/` (or loaded as an external addon). The root `index.ts` exports a module class decorated with `@DefineModule`.

```
src/modules/myfeature/
├── index.ts                     # Module declaration & Shapeshift config schema
├── commands/                    # Slash commands & subcommands
│   └── mycommand.ts
├── listeners/                   # Event listeners
│   └── mylistener.ts
├── services/                    # Business logic singletons
│   └── myservice.ts
├── scheduled-tasks/             # BullMQ background jobs (STRICTLY NAMED)
│   └── mytask.ts
└── interaction-handlers/        # Buttons, select menus, modal submit handlers
    └── myhandler.ts
```

> [!CAUTION]
> **Strict Directory Naming for Background Jobs**:
> BullMQ task definitions MUST be placed in `scheduled-tasks/`. Any other directory name will prevent task registration.

---

## 🧩 Module Declaration (`@DefineModule`)

Modules declare metadata, default enabled state, and configuration schemas using the `@DefineModule` decorator and `cfg.*` schema helpers.

```typescript
// packages/core/src/modules/sample/index.ts
import { DefineModule, Module } from "#lib/module-system.js";
import { s } from "@sapphire/shapeshift";

@DefineModule({
  name: "sample",
  description: "A sample feature module demonstrating configuration and services",
  defaultEnabled: true,
  configSchema: {
    maxItems: s.number.default(10),
    logChannel: s.string.nullable.default(null),
    enableAlerts: s.boolean.default(true),
  },
})
export default class SampleModule extends Module {}
```

---

## 💬 Commands (`BaseCommand` & `BaseSubcommand`)

Commands extend `BaseCommand` or `BaseSubcommand` from `#lib/commands.js`. They automatically append permission preconditions based on the specified `permissionLevel`.

```typescript
// packages/core/src/modules/sample/commands/samplecommand.ts
import { BaseCommand } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions.js";
import { replySuccess, replyError } from "#lib/utilities/cards.js";
import { ApplyOptions } from "@sapphire/decorators";

@ApplyOptions<BaseCommand.Options>({
  name: "sample",
  description: "Execute sample module action",
  permissionLevel: PermissionLevel.MOD, // Permission check applied automatically
})
export class SampleCommand extends BaseCommand {
  public override registerApplicationCommands(registry: BaseCommand.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName(this.name)
        .setDescription(this.description)
        .addStringOption((opt) =>
          opt.setName("target").setDescription("Target item name").setRequired(true)
        )
    );
  }

  public override async chatInputRun(interaction: BaseCommand.ChatInputCommandInteraction) {
    const target = interaction.options.getString("target", true);
    
    // Perform command logic
    if (target === "invalid") {
      return replyError(interaction, "Invalid Target", "The requested target cannot be processed.");
    }

    return replySuccess(interaction, "Target Processed", `Successfully updated target **${target}**.`);
  }
}
```

---

## 🎴 Card System & Response Helpers

Lumi strictly forbids building raw `EmbedBuilder` instances in modules. All UI responses must use standardized card utility functions from `packages/core/src/lib/utilities/cards.ts`:

### Card Builders

- `makeSuccessCard(title, description)` — Green success embed.
- `makeErrorCard(title, description)` — Red error embed.
- `makeWarningCard(title, description)` — Yellow warning embed.
- `makeInfoCard(title, description)` — Blue information embed.
- `makeListCard(title, items, page, totalPages)` — Standardized paginated list card.

### Response Helpers

- `replySuccess(interaction, title, description, ephemeral?)`
- `replyError(interaction, title, description, ephemeral?)`
- `replyWarning(interaction, title, description, ephemeral?)`
- `replyInfo(interaction, title, description, ephemeral?)`
- `sendReply(interaction, options)`

```typescript
import { makeSuccessCard, replySuccess } from "#lib/utilities/cards.js";

// Quick reply
await replySuccess(interaction, "Action Complete", "The user has been updated successfully.");

// Custom card construction
const card = makeSuccessCard("Custom Success", "Detailed description of operation")
  .addFields({ name: "Reason", value: "Audit log compliance" });

await interaction.reply({ embeds: [card] });
```

---

## 🔐 Permission Hierarchy

Permissions are structured as a linear numeric hierarchy (`PermissionLevel`):

| Level | Enum Value | Description |
|---|---|---|
| `0` | `USER` | Standard guild member |
| `5` | `MOD` | Server Moderator (requires Manage Messages / Kick permissions) |
| `7` | `ADMIN` | Server Administrator (requires Administrator permission) |
| `8` | `GUILD_OWNER` | Discord Guild Owner |
| `10` | `BOT_OWNER` | Bot Application Owner / Developer |

Set `permissionLevel` in your command options, and `BaseCommand` will auto-wire the precondition check.

---

## 🧠 Service Pattern (`Service`)

Business logic should be encapsulated in singleton services extending `Service` (`#lib/module-system/Service.js`). Services provide direct access to `this.logger`, `this.db` (`DatabaseService`), and `this.redis`.

```typescript
// packages/core/src/modules/sample/services/sampleservice.ts
import { Service } from "#lib/module-system/Service.js";
import { getService } from "#lib/module-system.js";

export class SampleService extends Service {
  public async processGuildData(guildId: string): Promise<number> {
    this.logger.info(`[SampleService] Processing data for guild ${guildId}`);
    
    // Database access via container.db facade
    const config = await this.db.getGuildConfig(guildId);
    
    // Redis access via container.redis
    await this.redis.set(`sample:guild:${guildId}`, JSON.stringify(config), "EX", 300);
    
    return 1;
  }
}

// Retrieve service inside commands or listeners:
const sampleSvc = getService<SampleService>("SampleService");
```

---

## 🎧 Listeners (`ModuleListener` & `GuildMessageListener`)

Module listeners extend `ModuleListener` (which automatically checks if the parent module is enabled for the target guild) or `GuildMessageListener`.

```typescript
// packages/core/src/modules/sample/listeners/messageCreate.ts
import { ModuleListener } from "#lib/module-system/ModuleListener.js";
import { Events } from "discord.js";
import type { Message } from "discord.js";

export class SampleMessageListener extends ModuleListener<typeof Events.MessageCreate> {
  public constructor(context: ModuleListener.Context, options: ModuleListener.Options) {
    super(context, {
      ...options,
      event: Events.MessageCreate,
      moduleName: "sample", // Automatically ignored if module is disabled for guild
    });
  }

  public override async run(message: Message) {
    if (message.author.bot || !message.guild) return;
    // Listener logic
  }
}
```

---

## ⏰ Background Tasks (`RelayTask`)

Background tasks that execute across distributed nodes must extend `RelayTask<K>` inside `scheduled-tasks/`:

```typescript
// packages/core/src/modules/sample/scheduled-tasks/sampletask.ts
import { RelayTask } from "#lib/scheduled-tasks.ts";

export class SampleTask extends RelayTask<"sampleTask"> {
  public constructor(context: RelayTask.Context, options: RelayTask.Options) {
    super(context, {
      ...options,
      name: "sampleTask",
    });
  }

  public override async runTask(payload: { guildId: string; userId: string }) {
    this.container.logger.info(`[SampleTask] Executing background task for ${payload.userId}`);
    // Perform background operation (e.g. remove temporary role)
  }
}
```

Schedule a task from commands or services using `scheduleTask()`:

```typescript
import { scheduleTask } from "#lib/schedule-task.js";

await scheduleTask("sampleTask", 60_000, {
  guildId: interaction.guildId,
  userId: user.id,
});
```

---

## 🗣️ Internationalization (i18n)

Lumi uses `@sapphire/plugin-i18next` for guild-specific translations. All user-facing strings must be localized in `packages/core/src/languages/<locale>/<module>.json`:

Supported locales: `en-US`, `de`, `es-ES`, `fr`.

```json
// packages/core/src/languages/en-US/sample.json
{
  "successTitle": "Operation Successful",
  "successDesc": "Processed item {{item}} for user {{user}}."
}
```

Retrieve translations in commands using `await this.fetchT(interaction)`:

```typescript
const t = await this.fetchT(interaction);
const title = t("sample:successTitle");
const desc = t("sample:successDesc", { item: "Widget", user: interaction.user.tag });
```

---

## 🚨 Strict Anti-Patterns & Development Guardrails

1. **❌ Zero Cross-Module Imports**: A module in `src/modules/foo/` MUST NEVER import from `src/modules/bar/`. Shared logic must be placed in `src/lib/`.
2. **❌ Direct Prisma Access Forbidden**: Never call `container.prisma` inside module code. Always use `container.db` (`DatabaseService`).
3. **❌ No Raw Embeds**: Use `makeSuccessCard`, `makeErrorCard`, etc., from `#lib/utilities/cards.js`.
4. **❌ No `JSON.parse` in try/catch**: Use `tryParseJSON(str)` from `@sapphire/utilities`.
5. **❌ No `.filter(Boolean)` on typed arrays**: Use `.filter(filterNullish)` from `@sapphire/utilities`.
6. **❌ Hardcoded Redis Keys Forbidden**: All Redis key strings MUST be declared in `RedisKeys` (`src/lib/database/redis.ts`).
7. **❌ No Manual `defaultMemberPermissions` Overrides**: Rely on `permissionLevel` in command options.
