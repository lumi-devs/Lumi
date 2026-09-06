---
title: "Quick Start: Your First Addon"
description: "How to build, test, and run your first custom Discord command in under 5 minutes."
category: "Addon SDK"
---

Lumi's Addon SDK allows you to create custom features, moderation rules, and slash commands without modifying any core bot code.

This guide walks you through building your first custom addon with a working slash command.

---

## 1. Scaffold a New Addon

From the root of your Lumi repository, run the interactive generator:

```bash
bun run addon:create welcome-messages --dir ./addons
```

This generates a clean module directory under `./addons/welcome-messages/`:

```
addons/welcome-messages/
├── info.json                    # Addon name, version, and author metadata
├── index.ts                     # Module definition and config schema
└── commands/
    └── welcome_messages.ts      # Slash command logic
```

---

## 2. Inspect the Module Definition (`index.ts`)

Open `addons/welcome-messages/index.ts`. Notice how concise the module definition is:

```typescript
import { cfg, DefineModule, Module } from "lumi";

@DefineModule({
  name: "welcome-messages",
  displayName: "Welcome Messages",
  emoji: "✨",
  version: "1.0.0",
  description: "Sends customized welcome greetings to new members.",
  configSchema: cfg.object({
    greeting: cfg.string({
      label: "Greeting Message",
      description: "Message sent when someone joins the server.",
      default: "Welcome to our community!",
    }),
  }),
})
export class WelcomeMessagesModule extends Module {
  public override async deleteUserData(userId: string): Promise<void> {
    // Called automatically if a user requests GDPR data erasure.
  }
}
```

Lumi automatically exposes your `configSchema` in the web dashboard as an editable form!

---

## 3. Add Your Slash Command

Open `addons/welcome-messages/commands/welcome_messages.ts`:

```typescript
import { BaseCommand, CommandContext } from "lumi/commands";
import { ApplyOptions } from "@sapphire/decorators";
import type { Command } from "@sapphire/framework";

@ApplyOptions<BaseCommand.Options>({
  name: "welcome",
  description: "Test the welcome message greeting",
})
export default class WelcomeCommand extends BaseCommand {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder.setName(this.name).setDescription(this.description)
    );
  }

  public override async run(ctx: CommandContext) {
    // Read the greeting setting configured for this server
    const greeting = await ctx.container.db.config.getModuleConfig(
      ctx.guildId,
      "welcome-messages",
      "greeting"
    );

    return ctx.replySuccess("Welcome Greeting", greeting ?? "Hello from Lumi!");
  }
}
```

---

## 4. Test in Local Development

1. Add your addons path to `.env`:
   ```bash
   LUMI_DEV_PATHS=./addons
   ```

2. Start the development cluster:
   ```bash
   bun run dev
   ```

3. In Discord, enable your new module in your test server:
   ```
   /module enable welcome-messages
   ```

4. Run your new slash command:
   ```
   /welcome
   ```

The bot immediately replies with a styled success card showing your greeting!

---

## 5. Verify Your Addon

Before sharing your addon with others, run the built-in validator:

```bash
bun run validate ./addons/welcome-messages
```

This verifies that your manifest is valid, permissions are configured correctly, and the addon adheres to security best practices.
