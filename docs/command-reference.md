# Lumi Command & Built-in Module Reference Catalog

> Complete, exhaustive catalog of all 8 built-in feature modules in Lumi-TS, detailing commands, subcommands, options, required permission levels, listeners, and background tasks.

---

## 📖 Module Catalog Overview

| Module Name | Description | Default State | Required Permission |
|---|---|---|---|
| 💤 **[afk](#-1-afk-module)** | AFK status tracking with mention notifications & auto-reset | Enabled | `USER` (0) |
| ⚙️ **[core](#-2-core-module)** | Bot system commands, module store management, & config | Enabled | `USER` (0) / `ADMIN` (7) / `BOT_OWNER` (10) |
| 🌐 **[dashboard](#-3-dashboard-module)** | Worker RPC service adapter for the `@lumi/dashboard` web portal | Enabled | N/A (Web RPC) |
| 🛡️ **[filter](#-4-filter-module)** | Regex message filter, link blocking, & spam protection | Disabled | `MOD` (5) |
| 📜 **[logging](#-5-logging-module)** | Server audit logging for message, member, & mod events | Disabled | `ADMIN` (7) |
| 🔨 **[mod](#-6-mod-module)** | Full moderation suite (ban, kick, timeout, warn, quarantine) | Enabled | `MOD` (5) / `ADMIN` (7) |
| 🎙️ **[tempvc](#-7-tempvc-module)** | Dynamic temporary voice channel creation & cleanup | Disabled | `ADMIN` (7) |
| 🔧 **[utility](#-8-utility-module)** | Server info, user inspection, avatars, & message purging | Enabled | `USER` (0) / `MOD` (5) |

---

## 💤 1. `afk` Module

The `afk` module tracks member Away-From-Keyboard status. When an AFK member is mentioned in chat, Lumi replies with a card indicating their status and reason. When the AFK member sends a message, their status is automatically cleared.

### Commands

#### `/afk set`
- **Description**: Set your AFK status with an optional status reason.
- **Permission Level**: `USER` (0)
- **Options**:
  - `reason` *(string, optional)*: Reason for going AFK (e.g. "Eating lunch").

#### `/afk clear`
- **Description**: Manually clear your active AFK status.
- **Permission Level**: `USER` (0)

#### `/afkclean`
- **Description**: Admin command to clean up stale AFK records in the database.
- **Permission Level**: `ADMIN` (7)

#### `/afklist`
- **Description**: View a list of currently AFK members in the server.
- **Permission Level**: `MOD` (5)

#### `/afkstats`
- **Description**: Display server AFK usage statistics.
- **Permission Level**: `USER` (0)

### Listeners & Background Tasks
- **`messageCreate`**: Intercepts chat messages to detect if the author is AFK (auto-clears status) or if mentioned users are AFK (sends notification card).
- **`afkDeleteMessage`** *(ScheduledTask)*: Automatically deletes AFK mention notification cards after a configurable grace period to prevent channel clutter.

---

## ⚙️ 2. `core` Module

The `core` module provides foundational bot commands, system health diagnostics, module store management (`/module`), interactive config panels (`/lumi`), and third-party addon downloading (`/download`, `/repo`).

### Commands

#### `/lumi`
- **Description**: Main system administration command.
- **Permission Level**: `ADMIN` (7)
- **Subcommands**:
  - `panel`: Opens the interactive guild configuration panel.
  - `status`: Displays bot cluster memory, uptime, latency, and active role.
  - `reload`: Reloads guild config cache and module settings.

#### `/module`
- **Description**: Manage feature modules for the current server.
- **Permission Level**: `ADMIN` (7)
- **Subcommands**:
  - `enable <module>`: Enable a feature module for the server.
  - `disable <module>`: Disable a feature module for the server.
  - `list`: List all available modules and their current guild toggle state.

#### `/help`
- **Description**: Interactive help menu listing commands for currently enabled modules.
- **Permission Level**: `USER` (0)

#### `/ping`
- **Description**: Displays WebSocket latency, REST API response time, and database ping.
- **Permission Level**: `USER` (0)

#### `/about`
- **Description**: Displays Lumi system information, version badges, and repository credits.
- **Permission Level**: `USER` (0)

#### `/dashboard`
- **Description**: Generates an instant OAuth2 login link for `@lumi/dashboard`.
- **Permission Level**: `ADMIN` (7)

#### `/download` / `/repo`
- **Description**: Manage and install third-party addons from official addon repositories.
- **Permission Level**: `BOT_OWNER` (10)

---

## 🌐 3. `dashboard` Module

The `dashboard` module contains no slash commands directly. It functions as the worker-side service adapter for `@lumi/dashboard` (the web portal).

### RPC Handlers (`@lumi/contracts`)
- **`guild.dashboard.get`**: Returns all available modules, current guild settings, permissions, and flat config fields derived from module Shapeshift schemas.
- **`guild.module.toggle`**: Enables or disables a specified module for the target guild over RPC.
- **`guild.config.set`**: Validates field inputs against module schemas and updates database configuration.

---

## 🛡️ 4. `filter` Module

The `filter` module provides real-time automated chat monitoring, regex pattern filtering, invite link blocking, and anti-spam enforcement.

### Configuration Options (Managed via `/lumi panel` or Web Dashboard)
- `enabled` *(boolean)*: Toggle global message filtering.
- `blockInvites` *(boolean)*: Automatically delete Discord invite links (`discord.gg/*`).
- `wordBlacklist` *(array)*: List of blocked regex patterns or forbidden phrases.
- `maxMentions` *(number)*: Maximum allowed user mentions per message before triggering anti-spam.
- `action` *(enum)*: Action taken upon violation (`WARN`, `DELETE`, `TIMEOUT`).

### Listeners
- **`messageCreate` / `messageUpdate`**: Scans incoming messages against regex rules and triggers enforcement actions.

---

## 📜 5. `logging` Module

The `logging` module subscribes to Discord events and outputs structured audit log cards to designated server log channels.

### Event Subscriptions
- **Message Events**: Message deletion (`messageDelete`), message edit (`messageUpdate`), bulk deletion (`messageDeleteBulk`).
- **Member Events**: Member join (`guildMemberAdd`), member leave (`guildMemberRemove`), role updates (`guildMemberUpdate`), nickname changes.
- **Moderation Events**: Bans, kicks, timeouts, quarantines, and warning issuances.

### Configuration Commands
- Handled through `/lumi panel` -> Logging Section, allowing admins to map specific event categories to separate channel IDs.

---

## 🔨 6. `mod` Module

The `mod` module is Lumi's core moderation engine, supporting manual discipline, timed punishments, audit trail cases, and automated penalty expirations.

### Commands

#### `/ban`
- **Description**: Ban a user from the server.
- **Permission Level**: `MOD` (5)
- **Options**:
  - `user` *(user, required)*: Target user.
  - `reason` *(string, optional)*: Reason for ban.
  - `duration` *(string, optional)*: Timed ban duration (e.g. `7d`, `24h`).
  - `delete_days` *(number, optional)*: Days of message history to delete (0-7).

#### `/kick`
- **Description**: Kick a user from the server.
- **Permission Level**: `MOD` (5)
- **Options**: `user` (required), `reason` (optional).

#### `/timeout`
- **Description**: Apply a Discord timeout (mute) to a user.
- **Permission Level**: `MOD` (5)
- **Options**: `user` (required), `duration` (required, e.g. `1h`), `reason` (optional).

#### `/warn`
- **Description**: Issue a formal warning to a user and log a moderation case.
- **Permission Level**: `MOD` (5)
- **Options**: `user` (required), `reason` (required).

#### `/quarantine`
- **Description**: Move a suspicious user to a isolated quarantine role.
- **Permission Level**: `MOD` (5)
- **Options**: `user` (required), `reason` (optional).

#### `/cases`
- **Description**: View moderation case history for a user or case ID.
- **Permission Level**: `MOD` (5)

#### `/sanitize`
- **Description**: Clean up offending nicknames or user statuses.
- **Permission Level**: `MOD` (5)

### Scheduled Tasks
- **`modLift`** *(RelayTask)*: Evaluates expired timed bans, timeouts, and quarantines, removing penalties automatically when the expiration duration is reached.

---

## 🎙️ 7. `tempvc` Module

The `tempvc` module creates dynamic temporary voice channels when users join a "Generator" voice channel, auto-assigns channel ownership, and deletes the channel when empty.

### Commands

#### `/tempvc setup`
- **Description**: Interactively create a Generator voice channel and category.
- **Permission Level**: `ADMIN` (7)

#### `/tempvc config`
- **Description**: Configure temporary voice channel defaults (user limits, channel name templates).
- **Permission Level**: `ADMIN` (7)

### Listeners & Background Tasks
- **`voiceStateUpdate`**: Detects when a user joins the Generator channel (triggers channel creation) or leaves a temporary channel.
- **`cleanup`** *(RelayTask)*: Periodic background task that audits voice channel registries and deletes empty, abandoned temporary voice channels.

---

## 🔧 8. `utility` Module

The `utility` module delivers essential server administration, inspection, and community utility tools.

### Commands

#### `/serverinfo`
- **Description**: Display detailed information about the Discord server (owner, creation date, member counts, boost level, security settings).
- **Permission Level**: `USER` (0)

#### `/whois`
- **Description**: Inspect a user's account details, join date, roles, permissions, and avatar.
- **Permission Level**: `USER` (0)
- **Options**: `user` *(user, optional)*.

#### `/avatar`
- **Description**: Display a user's full-resolution avatar.
- **Permission Level**: `USER` (0)

#### `/banner`
- **Description**: Display a user's profile banner.
- **Permission Level**: `USER` (0)

#### `/nick`
- **Description**: Change a member's nickname.
- **Permission Level**: `MOD` (5)

#### `/purge`
- **Description**: Bulk delete up to 100 messages from a text channel.
- **Permission Level**: `MOD` (5)
- **Options**: `amount` *(number, 1-100, required)*, `user` *(user, optional)*.
