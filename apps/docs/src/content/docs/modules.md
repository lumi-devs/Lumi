---
title: "Built-In Modules & Addons"
description: "The nine built-in features, security tools, Downloader architecture, and GDPR lifecycle."
category: "Core Architecture"
---

# Built-In Modules & Addons

Lumi ships with nine built-in core modules under `packages/core/src/modules/`. Everything is enabled by default per guild except `core` (which is mandatory and cannot be disabled). Turn any module on or off per server using `/lumi panel` → **Modules** or the web dashboard.

| Module | Purpose |
| :--- | :--- |
| **`core`** | Help, about, module toggles, configuration panel, permit system, and addon hub. Always enabled (`disableable: false`). |
| **`mod`** | Moderation suite: warn, mute, kick, ban, timeout, quarantine, case logs, mod notes, and decaying warnings. |
| **`filter`** | Automated content filtering: banned words/regex, spam links, invite links, mention spam, and excessive caps. |
| **`security`** | Anti-raid, anti-nuke audit protection, join gate verification, panic mode, and automated structural backups. |
| **`logging`** | Comprehensive audit logs for member joins/leaves, message edits/deletions, bans, and nickname changes. |
| **`afk`** | Away-from-keyboard status with mention notifications and `[AFK]` nickname tagging. |
| **`tempvc`** | On-demand dynamic temporary voice channels that automatically clean up when empty. |
| **`utility`** | General-purpose utilities and information commands. |
| **`dashboard`** | Controls dashboard RPC access for the server. Disabling it blocks dashboard API access while preserving bot commands. |

---

## The Security Suite

The security suite (`security` module) integrates anti-nuke protection, the join gate, panic mode, and automated backups:

### Anti-Nuke: Immediate Threat Mitigation

Lumi monitors the Discord audit log for rapid administrative changes—mass bans, mass kicks, channel deletions, role modifications, or webhook creations. If an account exceeds configured action thresholds:

1. **Configurable Actions**: Log only, quarantine (strip all roles and assign a quarantine role), or ban immediately.
2. **Quarantine Immunity**: The server owner, the bot client, trusted roles, and administrators with an **enforced permit** tier are immune to quarantine, preventing staff lockouts.
3. Requires the **View Audit Log** Discord permission.

### Join Gate & Verification

- **Account Age Filtering**: Flag or kick accounts younger than a configured threshold.
- **Raid Detection**: Dynamically detects join surges and elevates join-gate enforcement (kick, timeout, or quarantine).
- **Interactive Verification**: `/verifypanel` posts an interactive emoji challenge. Members who fail to verify within the time limit can be automatically kicked.
- **Join Filters**: Blocks avatar-less accounts, unverified bots, suspicious usernames, or display names containing links/invites.

### Panic Mode

`/panic` initiates an emergency lockdown:
- Mutes `@everyone` across configured text channels and pauses server invites.
- Remembers channel permission overrides prior to panic mode.
- One-click reversion restores previous channel states and unpauses invites.

### Backup & Restore

- Anti-nuke periodically creates structural snapshots of the server (roles, channels, permissions, and position hierarchies).
- `/restore` reconstructs corrupted server structure from the latest snapshot.

### Heat-Based Content Filtering

The `filter` module calculates a running "heat" score per member. Infractions increase heat while a cooldown decay reduces it over time. Crossing configurable thresholds triggers automatic escalation (timeout, kick, or ban).

---

## Module & Addon Architecture

Lumi distinguishes between **First-Party Built-In Modules** and **Third-Party Addons**:

### 1. Built-In Modules (First-Party)

- **Location**: Monorepo under `packages/core/src/modules/<name>/`.
- **Version Inheritance**: Built-in modules dynamically inherit `version` from `packages/core/package.json` at build time via `manifestFromMeta()`.
- **Manifest Generation**: Static metadata is generated into `manifest.json` using `bun run modules:manifest`.
- **Safety**: Cannot be uninstalled or rolled back by the Downloader. Critical core features in `core` are marked `disableable: false`.

---

### 2. Third-Party Addons (Downloader Architecture)

Addons are external modules distributed via Git repositories:

#### A. Repository Registration

```sh
# Add a repository (stored in data/3rd-party-modules/<name>/)
,repo add lumi-addons https://github.com/lumi-devs/lumi-addons.git

# Install an addon
,download install lumi-addons <addon-name>

# Install at a specific git commit, branch, or tag
,download install lumi-addons <addon-name> <revision>

# Roll back an installed addon to a previous revision
,download rollback <addon-name> <revision>

# Pin an addon against automatic updates
,module pin <addon-name>
```

#### B. The `info.json` Specification

Every addon directory must contain an `info.json` metadata file:

```json
{
  "name": "welcome-messages",
  "author": ["AuthorName"],
  "description": "Customizable welcome greetings.",
  "short": "Welcome message addon.",
  "version": "1.0.0",
  "requirements": [],
  "end_user_data_statement": "This addon does not store personal user data."
}
```

- **Dependency Management**: External npm dependencies listed in `requirements` are installed into the addon's private directory.
- **Pinning**: Pinned addons (`pinned: true`) are skipped during `,module update` or `,repo update`.

---

### 3. Module Discovery & Resolution Precedence

When `ModuleStore` initializes on worker boot, it discovers modules according to the following precedence hierarchy:

```
1. data/installed-modules/       (Installed third-party addons)
2. LUMI_DEV_PATHS                (Local development directories)
3. packages/core/src/modules/    (Built-in core modules)
```

Higher precedence directories override lower ones with the same module name.

---

## Data Privacy & GDPR Lifecycle

Lumi enforces a unified GDPR erasure and export pipeline:

1. **Built-in Modules**: Modules storing user data (`afk`, `mod`, `tempvc`, `core`) implement `deleteUserData(userId, requester)` and `exportUserData(userId)` hooks. Data is removed or anonymized across PostgreSQL and Redis.
2. **Stateless Modules (`NoEndUserData()`)**: Modules storing zero user data (`dashboard`, `filter`, `logging`, `security`, `utility`) declare `endUserDataStatement: NoEndUserData()` (or `noEndUserData()`).
3. **Third-Party Addons**: Must declare privacy disclosures in `info.json` under `end_user_data_statement` and implement `deleteUserData` overrides when handling user IDs.


