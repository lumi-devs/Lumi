---
title: "Database & Prisma Service"
description: "Comprehensive guide to Lumi's Prisma ORM, repository architecture, connection pooling, and offline testing."
category: "Core Architecture"
---

# Database & Prisma Service

Lumi uses **PostgreSQL** with **Prisma ORM** as its persistent data tier, managed through the central `DatabaseService` (`container.db`).

## Repository Architecture

Modules must never access `container.prisma` directly. All database access flows through typed repositories exposed on `container.db`:

```
                    ┌─────────────────────────┐
                    │     Module Code         │
                    └───────────┬─────────────┘
                                │
                                ▼
                    ┌─────────────────────────┐
                    │ container.db            │
                    │ (DatabaseService)       │
                    └───────────┬─────────────┘
                                │
        ┌───────────────┬───────┴───────┬───────────────┐
        ▼               ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  config      │ │  moderation  │ │  audit       │ │  guildKV     │
│ (ConfigRepo) │ │ (ModRepo)    │ │ (AuditRepo)  │ │ (KVRepo)     │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```

### Core Repositories

| Repository | Access Property | Purpose |
| :--- | :--- | :--- |
| **ConfigRepository** | `container.db.config` | Guild configuration, prefix, enabled modules, and locale settings. |
| **ModerationRepository** | `container.db.moderation` | Moderation cases (warn, mute, kick, ban), active timeouts, and case notes. |
| **AuditRepository** | `container.db.audit` | Structured administrative audit logs with 90-day retention. |
| **GuildKVRepository** | `container.db.guildKV` | Per-guild JSON key-value store used by modules for lightweight state. |
| **PermissionRepository** | `container.db.permissions` | Guild permit rules, role overrides, and channel permit masks. |

---

## Schema Migrations

The Prisma schema is defined at `prisma/schema.prisma`.

### Common Commands

```bash
# Generate the Prisma TypeScript client
bun run db:generate

# Apply pending migrations to the local database
bun run db:migrate

# Create a new named migration after modifying schema.prisma
bun prisma migrate dev --name <migration_name>
```

---

## Connection Pooling & PgBouncer

In production deployments, Lumi distinguishes between transaction-pooled and direct connections:

- `POSTGRES_URL`: Transaction-mode PgBouncer connection URI (e.g. port `6432`).
- `DIRECT_POSTGRES_URL`: Direct unpooled PostgreSQL URI (e.g. port `5432`) required for Prisma migrations.

---

## Unit Testing with Offline Mock Prisma

Lumi includes an offline mock Prisma driver (`packages/core/tests/mocks/prisma.ts`) allowing unit tests to run in-memory without requiring a live PostgreSQL instance.
