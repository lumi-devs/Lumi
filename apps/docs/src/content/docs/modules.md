---
title: "Built-In Modules & Addons"
description: "Overview of Lumi's nine built-in modules, security features, and community addon installation."
category: "Core Architecture"
---

Lumi comes with nine built-in core modules. Everything except the `core` system module can be enabled or disabled per server to fit your community's needs.

To toggle modules in Discord, run `/lumi panel` and select **Modules**, or use the web dashboard at `/guild/[guildId]/config/modules`.

---

## Built-In Modules

| Module | What it does | Default State |
| :--- | :--- | :--- |
| **`core`** | Bot info, help menus, permit management, and the module toggle system. | Always Enabled |
| **`mod`** | Moderation commands (warn, kick, ban, timeout, purge), case numbers, and staff notes. | Enabled |
| **`filter`** | Automated message filtering: banned words, spam links, invite links, and mention spam protection. | Enabled |
| **`security`** | Server raid mitigation, panic mode lockdown, join gate verification, and structural backups. | Enabled |
| **`logging`** | Audit logs for member joins/leaves, message edits/deletions, role updates, and voice channels. | Enabled |
| **`afk`** | Away status system with automatic mention notices and `[AFK]` nickname tagging. | Enabled |
| **`tempvc`** | Creates disposable voice channels when members join a generator channel, deleted when empty. | Enabled |
| **`utility`** | Helpful server commands: user avatars, server info, polls, and latency diagnostics. | Enabled |
| **`dashboard`** | Controls whether the server appears in the Next.js web dashboard. | Enabled |

---

## The Security Suite

The `security` module provides four critical protections for server safety:

### 1. Anti-Raid & Rate Limits
Monitors member join spikes. If an unusual influx of accounts joins within a short window, Lumi alerts server staff and can temporarily engage the join gate.

### 2. Join Gate Web Verification
New members must complete a simple interactive verification challenge in a designated `#verify` channel before receiving membership roles. This stops uncoordinated mass-bot spam.

### 3. Panic Mode (One-Click Lockdown)
In an active raid, run `/panic on`. Lumi instantly revokes send-message permissions across all public channels while preserving your existing permission overrides. Run `/panic off` when the threat clears to restore your exact previous channel permissions.

### 4. Structural Server Backups
Saves a snapshot of server channels, categories, roles, and permission overrides. If a rogue administrator wipes channels or alters roles, you can restore server structure from the web dashboard.

---

## Installing Community Addons

In addition to built-in modules, Lumi can download and install community-created addons from Git repositories without restarting the bot:

### 1. Register an Addon Repository
```
,repo add lumi-addons https://github.com/lumi-devs/lumi-addons.git
```

### 2. Install an Addon
```
,download install lumi-addons custom-roles
```

### 3. Enable the Module in Your Server
```
/module enable custom-roles
```

### 4. Uninstall or Roll Back
```
# Roll back to a previous commit or version:
,download rollback custom-roles <commit-hash>

# Uninstall the addon:
,download uninstall custom-roles
```

To create your own custom modules, see the [Quick Start Addon Guide](/guides/quick-start-addon).
