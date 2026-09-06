---
title: "Permissions & Permit System"
description: "How Lumi's granular permit node hierarchy works, role overrides, and command gating."
category: "Core Architecture"
---

Discord's built-in permissions (like `Administrator` or `Manage Messages`) are all-or-nothing. If you give a moderator permission to manage messages, they might also be able to pin spam or delete announcements.

Lumi replaces this with a **permit node system** inspired by UNIX permissions and Role-Based Access Control (RBAC). It allows you to grant specific commands to specific roles or channels without granting full Discord administrative power.

---

## Permit Nodes Explained

Permit nodes use simple dot notation:

| Node | What it allows |
| :--- | :--- |
| `mod.ban` | Ban or unban members. |
| `mod.mute` | Timeout members. |
| `mod.warn` | Issue warnings or check warning history. |
| `mod.*` | Wildcard: allows every moderation action. |
| `admin.config.read` | View server settings and module toggles. |
| `admin.config.write` | Change server configuration and prefix. |
| `admin.*` | Full bot administration access on this server. |

When checking a user's permissions, Lumi evaluates hierarchically: possessing `mod.*` automatically grants access to `mod.ban`, `mod.mute`, and `mod.warn`.

---

## Configuring Permits for Your Server

Server owners and administrators can assign permit nodes to roles or members using slash commands or the web dashboard:

### Granting a Permit
```
/permit grant role:@Moderator node:mod.warn
```

### Checking Active Permits
```
/permit list
```

### Revoking a Permit
```
/permit revoke role:@Moderator node:mod.warn
```

You can also restrict commands to specific channels using channel overrides (for example, allowing `/tag create` only in `#bot-commands`).

---

## Using Permits in Custom Commands

When writing custom slash commands or addons with the `@lumi` SDK, you can protect them by specifying `requiredPermit`:

```typescript
import { LumiCommand, type CommandContext } from "lumi";

export class BanCommand extends LumiCommand {
  public constructor(context: LumiCommand.Context) {
    super(context, {
      name: "ban",
      description: "Ban a member from the server",
      requiredPermit: "mod.ban",
    });
  }

  public override async chatInputRun(ctx: CommandContext) {
    // Lumi automatically checks if the user has `mod.ban` or `admin.*`
    // If they lack the permit, they receive a clean error card and this code never runs.
    const target = ctx.options.getUser("user", true);
    await ctx.guild?.members.ban(target.id);
    return ctx.replySuccess("Member Banned", `<@${target.id}> was banned.`);
  }
}
```

---

## Bot Owner Superuser

The bot owner (configured via `OWNER_IDS` in your `.env` file) automatically bypasses all permit checks across all servers. This ensures you never get locked out of administrative commands on your own self-hosted bot.
