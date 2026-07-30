# Module Creation Guide

This guide walks through creating a new feature module for Lumi.

## Prerequisites

- Complete setup as described in [CONTRIBUTING.md](../CONTRIBUTING.md)
- Understand the module system rules in [AGENTS.md](../AGENTS.md)

## Step 1: Directory Structure

Create a directory under `packages/core/src/modules/<your-module>/`:

```
packages/core/src/modules/<your-module>/
  index.ts          # Module entrypoint - @DefineModule decorator
  commands/         # Slash/text commands extending BaseCommand
  listeners/        # Event listeners extending ModuleListener
  services/         # Singleton services extending Service
  interaction-handlers/  # Button/select/modal handlers
  scheduled-tasks/  # BullMQ cron/delayed tasks extending RelayTask
  lib/              # Internal helpers (not exported outside module)
```

## Step 2: Define Module Metadata

`packages/core/src/modules/<your-module>/index.ts`:

```typescript
import { Module, DefineModule, cfg } from "#core/module-system/Module.js";
import { Emojis } from "#lib/utilities/assets.js";

@DefineModule({
  name: "my_module",            // lowercase snake_case id
  displayName: "My Module",     // human-readable name
  emoji: Emojis.GEAR,           // icon from assets
  version: "1.0.0",
  description: "What this module does.",
  defaultEnabled: true,
  configSchema: {
    some_setting: cfg.boolean.default(true),
  },
})
export class MyModule extends Module {}
```

Config fields use `cfg.*` builders from `@sapphire/shapeshift` via `#core/module-system/Module.js`.

## Step 3: Add Commands

`packages/core/src/modules/<your-module>/commands/hello.ts`:

```typescript
import { ApplyOptions } from "@sapphire/decorators";
import { BucketScope, Command } from "@sapphire/framework";
import type { ChatInputCommandInteraction } from "discord.js";
import { BaseCommand, replySuccess } from "#lib/commands.js";

@ApplyOptions<Command.Options>({
  name: "hello",
  description: "Say hello.",
  cooldownDelay: 5_000,
  cooldownScope: BucketScope.User,
})
export class HelloCommand extends BaseCommand {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder.setName(this.name).setDescription(this.description),
    );
  }

  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    await replySuccess(interaction, "Hello!", "Welcome to my module.");
  }
}
```

## Step 4: Add Listeners

`packages/core/src/modules/<your-module>/listeners/greet.ts`:

```typescript
import { ApplyOptions } from "@sapphire/decorators";
import { Events } from "@sapphire/framework";
import { ModuleListener } from "#core/module-system/ModuleListener.js";

@ApplyOptions<ModuleListener.Options>({
  name: "my-module-greet",
  event: Events.GuildMemberAdd,
})
export class GreetListener extends ModuleListener {
  public override async run(member: import("discord.js").GuildMember) {
    // Handle member join
  }
}
```

## Step 5: Add Scheduled Tasks

`packages/core/src/modules/<your-module>/scheduled-tasks/cleanup.ts`:

```typescript
import { ApplyOptions } from "@sapphire/decorators";
import { RelayTask } from "#lib/schedule-task.js";

@ApplyOptions<RelayTask.Options>({
  name: "my-module-cleanup",
  interval: 3_600_000, // every hour
})
export class CleanupTask extends RelayTask<"my-module-cleanup"> {}
```

## Step 6: Add Translations

Create `packages/core/src/languages/en-US/<your-module>.json`:

```json
{
  "hello": "Hello, {{user}}!",
  "goodbye": "Goodbye."
}
```

Fetch translations in code:

```typescript
const t = await this.fetchT(interaction);
await replySuccess(interaction, t("hello", { user: interaction.user.displayName }));
```

## Step 7: Generate Manifest

```bash
bun run modules:manifest
```

## Step 8: Write Tests

Create `packages/core/tests/modules/<your-module>/<test>.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

describe("MyModule", () => {
  it("should work", () => {
    expect(true).toBe(true);
  });
});
```

## Step 9: Verify

```bash
bun run typecheck && bun run lint && bun run test
```

## Rules

- **No cross-module imports**: Never `import` from sibling modules. Move shared code to `#lib/*`.
- **No raw EmbedBuilder**: Use card helpers from `#utilities/cards.js` and `#lib/commands.js`.
- **No direct `container.prisma`**: Use `container.db` (`DatabaseService`).
- **No direct `redis.del`**: Use `container.invalidation.invalidate(...)`.
- **Use `#` aliases**: Import using `#lib/*`, `#database/*`, `#utilities/*` with `.js` extension.
