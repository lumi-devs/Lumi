# `@lumi/sdk`

<div align="center">
  <img src="https://img.shields.io/badge/Package-Developer%20SDK-blue?style=for-the-badge" alt="Package">
  <img src="https://img.shields.io/badge/Addons-Public%20API-brightgreen?style=for-the-badge" alt="Addons">
</div>

> Stable developer SDK for constructing third-party Lumi modules, slash commands, listeners, services, and card UIs.

---

## 📦 Role & Overview

`@lumi/sdk` provides the public interface surface for third-party addon developers. By building against `@lumi/sdk`, addons are insulated from `@lumi/core` internal refactoring and alias changes.

---

## 🔑 Key Exported Surfaces

- **Module Decorators & Base Classes**: `@DefineModule`, `Module`, `Service`.
- **Command & Interaction Framework**: `BaseCommand`, `BaseSubcommand`.
- **Interaction Reply Helpers**: `replySuccess`, `replyError`, `replyWarning`, `replyInfo`, `sendReply`.
- **Card Builders**: `makeSuccessCard`, `makeErrorCard`, `makeWarningCard`, `makeInfoCard`, `makeListCard`.
- **Permissions**: `PermissionLevel` enum (`USER`, `MOD`, `ADMIN`, `GUILD_OWNER`, `BOT_OWNER`).
- **Formatting Utilities**: Re-exports `@discordjs/formatters` (`userMention`, `channelMention`, `roleMention`, `time`, `TimestampStyles`, `escapeMarkdown`, etc.).
- **Contracts**: Re-exports `@lumi/contracts` wire types and schemas.

---

## 💻 Addon Developer Code Snippet

```typescript
import {
  DefineModule,
  Module,
  BaseCommand,
  replySuccess,
  PermissionLevel,
} from "@lumi/sdk";

@DefineModule({
  name: "hello",
  description: "Greeter addon example",
})
export default class HelloModule extends Module {}

export class HelloCommand extends BaseCommand {
  public constructor(context: BaseCommand.Context, options: BaseCommand.Options) {
    super(context, {
      ...options,
      name: "hello",
      description: "Greets the executing user",
      permissionLevel: PermissionLevel.USER,
    });
  }

  public override async chatInputRun(interaction: BaseCommand.ChatInputCommandInteraction) {
    return replySuccess(interaction, "Hello!", `Welcome to the server, ${interaction.user}!`);
  }
}
```
