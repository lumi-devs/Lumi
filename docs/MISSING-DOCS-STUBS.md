# Wave 10 Missing Documentation Stubs

Ready-to-fill templates for critical missing documentation. Copy these structures into `apps/docs/src/content/docs/` with completed content during Wave 10.

---

## 1. Command Reference Stub

**File**: `apps/docs/src/content/docs/commands.md`

```markdown
---
title: "Command Reference"
description: "Complete list of all Discord slash commands grouped by module."
category: "User Guide"
---

# Command Reference

This is the complete reference for every command available in Lumi. Commands are organized by module—toggle any module on/off using `/lumi panel` → **Modules**.

> [!TIP]
> Can't find a command? It might be disabled for your guild. Ask a server owner to enable the module in `/lumi panel` → **Modules**, or check the [Troubleshooting Guide](/troubleshooting).

## Quick Navigation
- [Core Module](#core) — Help, about, module toggles
- [Moderation Module](#mod) — Bans, kicks, warnings, mutes
- [Filter Module](#filter) — Word filter, invite detection, spam
- [Security Module](#security) — Anti-raid, join gate, backups
- [Logging Module](#logging) — Audit logs, member tracking
- [AFK Module](#afk) — Away status and mentions
- [Temp VC Module](#tempvc) — Dynamic voice channels
- [Utility Module](#utility) — General-purpose tools
- [Dashboard Module](#dashboard) — Web panel access control

---

## Core Module

The `core` module is always enabled and provides foundational features.

### `/help`
**Description**: TODO  
**Parameters**: None  
**Permissions**: None  
**Usage**: `/help`  
**Example**: See `/help` in your server for the list.

### /about
**Description**: TODO  
**Parameters**: None  
**Permissions**: None  
**Usage**: `/about`  
**Example**: `/about` shows version, uptime, and bot stats.

### /config
**Description**: TODO  
**Parameters**: TODO  
**Permissions**: `admin.config.read`  
**Usage**: `/config [module-name]`  
**Example**: `/config moderation` shows moderation settings.

... (repeat for all commands in Core)

---

## Moderation Module

Moderation tools: bans, kicks, warnings, timeouts.

### /ban
**Description**: TODO  
**Parameters**:
- `user` (required): The user to ban
- `reason` (optional): Why they were banned
- `delete_days` (optional): Messages to delete (0–7)

**Permissions**: `mod.ban`  
**Usage**: `/ban @user reason:"spam"` or `/ban user-id reason:"advertising"`  
**Example**:
```
/ban @BadUser reason:"Repeated harassment"
```

... (repeat for all moderation commands)

---

## Filter Module

Automated content filtering.

### /filter config
**Description**: TODO

... (repeat for all filter commands)

---

## Security Module

Anti-raid, join gates, backups.

### /verifypanel
**Description**: TODO

... (repeat for all security commands)

---

## Logging Module

Audit logs and event tracking.

### /logs
**Description**: TODO

... (repeat for all logging commands)

---

## AFK Module

Away-from-keyboard status.

### /afk
**Description**: TODO

... (repeat for all AFK commands)

---

## Temp VC Module

Dynamic voice channels.

### /tempvc setup
**Description**: TODO

... (repeat for all tempvc commands)

---

## Utility Module

General-purpose utilities.

### /avatar
**Description**: TODO

... (repeat for all utility commands)

---

## Dashboard Module

Web panel access control.

### /dashboard access
**Description**: TODO

... (repeat for all dashboard commands)

---

## Legacy Prefix Commands

If your bot has the prefix command enabled (default `,`), you can use these:

### ,help
**Description**: TODO

... (repeat for any prefix commands)

---

## Troubleshooting

### "I don't see a command I expect"
Check:
1. Is the module enabled? Use `/lumi panel` → **Modules**
2. Do you have permission? Ask an admin (needs `admin.config.read` to check)
3. Is the command available in your region? (Very rare for Lumi)

### "The command works but shows an error"
See the [Troubleshooting Guide](/troubleshooting) for common error resolutions.

---

## Next Steps
- Configure modules: [Module Configuration](/guides/module-configuration) (TODO)
- Set up permissions: [Permission System Guide](/permissions)
- Use the dashboard: [Dashboard User Guide](/guides/dashboard-user-guide)
```

---

## 2. Dashboard User Guide Stub

**File**: `apps/docs/src/content/docs/guides/dashboard-user-guide.md`

```markdown
---
title: "Dashboard User Guide"
description: "How to operate the Lumi web administration panel."
category: "User Guide"
---

# Dashboard User Guide

The Lumi dashboard is a Next.js web panel that lets you manage your server configuration, members, and module settings without leaving your browser.

## Access & Login

### Getting the Dashboard URL
Your server owner should tell you the dashboard URL. It's typically one of:
- `https://lumi.your-domain.com`
- `https://lumi.example.com:8080`
- `http://localhost:8080` (local testing)

### Logging In
1. Open the dashboard URL
2. Click **Log in with Discord**
3. Authorize Lumi to access your profile
4. Select your guild (server)

> [!NOTE]
> You must have **Admin** permission in the guild to access the dashboard. If you see "Not Authorized", ask your server owner.

---

## Main Navigation

The dashboard sidebar contains:
- **Home** — Overview and quick stats
- **Server Settings** — Guild-wide configuration
- **Modules** — Toggle and configure modules
- **Members** — View and manage guild members
- **Logs** — Audit trail of actions
- **Permissions** — Role-based access control
- **Backups** — View structural backups

---

## Server Settings

### Guild Information
- Guild name, ID, owner
- Member count, verification level
- Default module settings for new members

### Configuration
TODO: Describe settings pages and what each does

---

## Modules

### Toggling Modules On/Off
TODO: Screenshot and instructions

### Module Configuration
TODO: Per-module settings

### Available Modules
- Core (always enabled)
- Moderation
- Filter
- Security
- Logging
- AFK
- Temp VC
- Utility
- Dashboard

---

## Members

### Viewing Members
TODO: Member list, filtering, search

### Member Profile
TODO: Warnings, notes, actions

---

## Logs

### Viewing the Audit Trail
TODO: Log entries, filtering by event type

---

## Permissions

### Permission Nodes
TODO: What are permits? How to assign them to roles.

---

## Troubleshooting

### "I can't log in"
See [Troubleshooting Guide](/troubleshooting).

### "Dashboard loads but shows no data"
Check that the worker is running and the RPC token is correct.

---

## Next Steps
- Learn about commands: [Command Reference](/commands)
- Set up permissions: [Permission System Guide](/permissions)
```

---

## 3. Monitoring & Alerts Setup Stub

**File**: `apps/docs/src/content/docs/guides/monitoring-alerts.md`

```markdown
---
title: "Monitoring & Alerts Setup"
description: "Configure Prometheus scraping, Grafana dashboards, and alerting."
category: "Operations & Runbooks"
---

# Monitoring & Alerts Setup

Lumi exposes production-ready metrics via Prometheus on port 9090. This guide covers setting up monitoring and alerts for your deployment.

## Prerequisites
- Prometheus server running (or Kubernetes monitoring stack)
- Grafana for visualization (optional but recommended)
- Alert manager for notifications (optional)

---

## Prometheus Configuration

### Scrape Config
TODO: Example `prometheus.yml` configuration

### Metrics Endpoint
TODO: Explanation of `/metrics` endpoint

---

## Key Metrics

| Metric | Type | Purpose |
| :--- | :--- | :--- |
| `lumi_commands_total` | Counter | TODO |
| `lumi_gateway_ping_ms` | Gauge | TODO |
| `lumi_event_stream_lag` | Gauge | TODO |
| `lumi_db_pool_active` | Gauge | TODO |

---

## Grafana Dashboards

TODO: Example dashboard JSON, import steps

---

## Alert Rules

TODO: Example alerting rules (high ping, pool exhaustion, etc.)

---

## Troubleshooting

### Metrics endpoint not responding
TODO: Diagnostics

---

## Next Steps
- [Production Deployment Guide](/guides/production-deployment)
- [Troubleshooting Guide](/troubleshooting)
```

---

## 4. Backup & Restore Procedures Stub

**File**: `apps/docs/src/content/docs/guides/backup-restore.md`

```markdown
---
title: "Backup & Restore Procedures"
description: "PostgreSQL backup strategies, restore validation, and disaster recovery."
category: "Operations & Runbooks"
---

# Backup & Restore Procedures

Lumi stores all persistent data in PostgreSQL. Redis data (cache, event queues) is regenerable. This guide covers backing up and restoring your data safely.

---

## Backup Strategy

### What to Back Up
- **PostgreSQL database** (all configuration, members, logs, cases)
- **Redis persistence** (optional; can be regenerated)
- **Media files** (if you store appeal evidence, etc.)

### What NOT to Back Up
- `.env` file (contains secrets; regenerate for each deployment)
- `node_modules/` (regenerate from `package.json`)
- `.next/` build directory (regenerate on startup)

---

## PostgreSQL Backups

### Docker Compose

#### Automated Nightly Backup
TODO: Backup script/cron job example

#### Manual Backup
```bash
docker compose exec postgres pg_dump -U lumi lumi > lumi-backup-$(date +%Y%m%d-%H%M%S).sql
```

### Kubernetes

TODO: Persistent volume snapshot, backup retention

---

## Restore Procedures

### From SQL Dump
TODO: Step-by-step restore from .sql file

### Validation
TODO: How to verify restore integrity

---

## Disaster Recovery

### Total Data Loss
TODO: Complete recovery runbook

### Partial Loss
TODO: Recovering specific guild data

---

## Backup Retention

TODO: Recommended backup policies (daily 7 days, weekly 4 weeks, etc.)

---

## Troubleshooting

### "Restore fails with permission error"
TODO: Diagnostics

---

## Next Steps
- [Production Deployment Guide](/guides/production-deployment)
- [Troubleshooting Guide](/troubleshooting)
```

---

## 5. Module Development Patterns Stub

**File**: `apps/docs/src/content/docs/guides/module-patterns.md`

```markdown
---
title: "Module Development Patterns"
description: "Common patterns for building Lumi modules and addons."
category: "Addon SDK"
---

# Module Development Patterns

This guide documents proven patterns for building reliable, maintainable Lumi modules.

---

## Service Layer Pattern

### What It Is
TODO: Explanation of services abstraction

### Example: Logging Service
TODO: Code example from built-in logging module

---

## Configuration-Driven Behavior

### Dynamic Configuration
TODO: cfg schema + runtime config reading

---

## Event-Driven Communication

### Cross-Module Communication Without Direct Imports
TODO: EventBus pattern example

---

## Command Lifecycle

### Reply Utilities
TODO: Context.replySuccess, Context.replyError

### Error Handling
TODO: Proper error handling in commands

---

## Scheduled Tasks

### Task Definition
TODO: RelayTask, registerTaskFireHandler

### Patterns
- Hourly cleanup
- Daily reports
- Weekly summaries

---

## Listeners

### Guild Events
TODO: listener pattern

### Message Events
TODO: GuildMessageListener

---

## GDPR Compliance

### deleteUserData Implementation
TODO: Example from a module

### exportUserData Implementation
TODO: Example

---

## Anti-Patterns

### ❌ Direct Sibling Imports
```typescript
// BAD: Violates module isolation
import { MuteService } from "../moderation/services/MuteService.js";
```

### ✅ EventBus Communication
```typescript
// GOOD: Use EventBus for inter-module communication
const eventBus = container.stores.get("services").get("event-bus");
```

---

## Next Steps
- [Module Creation Guide](/guides/module-creation)
- [Addon Publishing Guide](/guides/addon-publishing)
```

---

## 6. Scaling & Performance Tuning Stub

**File**: `apps/docs/src/content/docs/guides/scaling-performance.md`

```markdown
---
title: "Scaling & Performance Tuning"
description: "Shard sizing, connection pooling, and performance optimization."
category: "Operations & Runbooks"
---

# Scaling & Performance Tuning

As your server grows, tune Lumi's resource allocation and deployment topology for maximum reliability and performance.

---

## Shard Sizing

### How Many Shards?
TODO: Formula based on server count

### Setting Shard Count
```bash
# In .env
TOTAL_SHARDS=auto          # Let Discord recommend
# OR
TOTAL_SHARDS=4             # Fixed count
SHARD_LIST=0,1,2,3         # This replica owns shards 0–3
```

---

## Database Tuning

### Connection Pooling
```bash
POSTGRES_POOL_MAX=10          # Each process gets 10 connections
# OR
POSTGRES_POOL_TOTAL=80        # Total pool, divided by shard count
```

### Query Optimization
TODO: Common slow queries + indexes

---

## Redis Optimization

### Memory Limits
```bash
REDIS_MAXMEMORY=512mb         # Total memory limit
REDIS_MAXMEMORY_POLICY=noeviction  # Fail rather than evict
```

### Event Stream Tuning
```bash
EVENT_STREAM_MAXLEN=100000           # Max queue length
EVENT_STREAM_MAX_DELIVERIES=5        # Retry attempts
```

---

## Monitoring Performance

### Metrics to Watch
TODO: Key metrics for capacity planning

---

## Troubleshooting Slowness

### High Latency
TODO: Diagnosis steps

### Pool Exhaustion
TODO: How to detect and fix

---

## Cost Optimization

TODO: Spot instances, resource requests for Kubernetes

---

## Next Steps
- [Production Deployment Guide](/guides/production-deployment)
- [Monitoring & Alerts Setup](/guides/monitoring-alerts)
```

---

## 7. Testing Guide Stub

**File**: `apps/docs/src/content/docs/guides/testing-strategy.md`

```markdown
---
title: "Testing Strategy & Examples"
description: "Unit, integration, and E2E testing patterns for Lumi modules."
category: "Addon SDK"
---

# Testing Strategy & Examples

Lumi uses Vitest for unit/integration testing and Vercel Agent Browser for E2E testing. This guide covers testing patterns for commands, listeners, and services.

---

## Unit Testing Commands

### CommandContext Mock
```typescript
// Example: Testing a command
import { describe, it, expect } from "vitest";
import { YourCommand } from "./your-command";

describe("YourCommand", () => {
  it("responds with success", async () => {
    // TODO: Mock CommandContext
    // TODO: Run chatInputRun
    // TODO: Assert response
  });
});
```

---

## Integration Testing

### Prisma Mocking
TODO: In-memory Prisma mock

---

## E2E Testing

### Full Command Flow
TODO: Vercel Agent Browser example

---

## Test Coverage

### Targets
- Core business logic: 90%+
- Commands: 80%+
- Listeners: 70%+

---

## Running Tests

```bash
bun run test              # Run all tests
bun run test --watch     # Watch mode
bun run test --coverage  # Coverage report
```

---

## Next Steps
- [Module Creation Guide](/guides/module-creation)
```

---

## 8. Database Schema Guide Stub

**File**: `apps/docs/src/content/docs/database-schema.md`

```markdown
---
title: "Database Schema Guide"
description: "Entity relationships, indexes, and data retention policies."
category: "Core Architecture"
---

# Database Schema Guide

Lumi's data model uses PostgreSQL with Prisma ORM. This guide documents every entity, relationship, and query pattern.

---

## Entity Overview

### Guild
TODO: What data is stored per guild?

### Member
TODO: Member data structure

### ModCase
TODO: Moderation case structure

### AuditLog
TODO: Audit log entry structure

---

## Relationships

### Guild → Member (1:N)
TODO: How members are linked to guilds

### Guild → ModCase (1:N)
TODO: How mod cases are linked

---

## Indexes

TODO: Key indexes for performance

---

## Data Retention

### Audit Logs
TODO: Default retention (e.g., 90 days)

### Warnings
TODO: Decay policy

---

## Query Patterns

### Pagination
TODO: How to paginate results safely

### Soft Deletes
TODO: How deleted data is handled

---

## Migrations

### Schema Changes
TODO: How to safely migrate

---

## ER Diagram

TODO: ASCII or embedded SVG diagram

---

## Next Steps
- [API Reference](/api-reference)
- [Architecture Guide](/architecture)
```

---

## 9. RPC Actions Reference Stub

**File**: `apps/docs/src/content/docs/rpc-actions.md`

```markdown
---
title: "RPC Actions Reference"
description: "Complete reference of dashboard-to-worker RPC actions."
category: "Core Architecture"
---

# RPC Actions Reference

The dashboard communicates with the worker via an internal HTTP RPC bridge. This document lists all 66 available actions.

---

## Action Categories
- [Guild Read/Write](#guild)
- [Member Read/Write](#member)
- [Module Management](#module)
- [Configuration](#config)
- [Permissions](#permissions)
- [Logging](#logging)
- [GDPR](#gdpr)

---

## Guild Actions

### guild.read
**Parameters**:
- `guildId` (string, required)

**Returns**:
```json
{
  "id": "guild-id",
  "name": "Guild Name",
  "memberCount": 1234
}
```

### guild.write
TODO: Write a guild setting

---

## Member Actions

TODO: Member read/write actions

---

## Module Actions

TODO: Module toggle, config

---

## Configuration Actions

TODO: Guild config read/write

---

## Troubleshooting

### "401 Unauthorized"
TODO: Diagnostics

---

## Next Steps
- [Dashboard User Guide](/guides/dashboard-user-guide)
- [API Reference](/api-reference)
```

---

## How to Use These Stubs

1. **Copy the stub content** from the relevant section above
2. **Create the file** in `apps/docs/src/content/docs/` with the correct filename
3. **Replace TODO sections** with actual content
4. **Test links** (run `bun run dev` in `apps/docs/`)
5. **Verify code examples** compile (or mark as pseudocode)
6. **Review** using the style guide in `docs/STYLE-GUIDE.md`

---

**Created**: 2026-09-03  
**For**: Wave 10 Documentation Implementation
