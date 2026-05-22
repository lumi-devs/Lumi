# Ember — Modular Discord Bot (TypeScript / Sapphire / Bun)

Ember is a modular Discord bot built with the **Sapphire Framework v5**, **discord.js v14**, and the **Bun** runtime. It uses **Prisma ORM** for database access, **Redis** for caching and RPC, and **RabbitMQ** for an event bus and job queue.

## Project Overview

- **Runtime:** [Bun](https://bun.sh) (runs TypeScript directly, no compile step needed).
- **Framework:** [Sapphire Framework](https://www.sapphirejs.dev/) (modular, custom piece-based architecture).
- **Database:** Prisma with Postgres (pure data access client layer).
- **Messaging:** Redis (caching/RPC/invalidation) and RabbitMQ (events/delayed and immediate jobs).
- **Architecture:** Feature-based modularity with a non-removable built-in `core` module and optional feature modules extending a custom `Module` piece class.

## Core Mandates & Rules

1.  **Never `new EmbedBuilder()`:** Use UI factories in `src/utilities/cards.ts` (`makeSuccessCard`, `makeErrorCard`, etc.).
2.  **Prisma Everywhere:** Always use `this.container.prisma` directly. No wrapper slop.
3.  **Modular Isolation:** Feature modules in `src/modules/` must not import from each other. Shared logic goes in `src/utilities/` or `src/database/`.
4.  **Error Handling:** Throw standard or typed errors. Global command/error listeners in `src/core/listeners/` capture and render them elegantly as error cards.
5.  **Slash Commands First:** All user-facing features must be slash commands. Prefix commands are reserved for owner/admin tools.
6.  **Redis Keys:** Never hardcode strings. Use strictly typed `RedisKeys` from `src/database/redis.ts`.

## Project Structure

```text
src/
├── main.ts                       # Entry point: DB connect -> RPC -> login
├── client/                       # Client setup and Sapphire client init
│   ├── EmberClient.ts            # Client initialization
│   └── setup.ts                  # Env, Redis, Sentry, RabbitMQ, and i18n setup
├── core/                         # Non-removable built-in core module
│   ├── index.ts                  # Built-in non-removable core Module piece
│   ├── commands/                 # Core commands (ping, config, downloader, etc.)
│   ├── lib/                      # Core module libraries (ping cards, downloader resolver)
│   ├── listeners/                # Core listeners (command events, ready, errors, diagnostics)
│   ├── module-system/            # Module base class and custom ModuleStore
│   ├── permissions/              # Custom preconditions and PermissionLevel resolution
│   ├── rabbitmq/                 # Optional RabbitMQ manager and job broker
│   ├── sentry/                   # Sentry integration breadcrumbs
│   └── types/                    # Core shared types & container augments
├── database/                     # Prisma & Redis client initialization
│   ├── prisma.ts                 # Prisma Client singleton
│   ├── redis.ts                  # Redis Client, RPC, and Invalidation Bus
│   └── settings/                 # Database settings modules (guild configs, afk, raids)
├── languages/                    # Localization system jsons (i18n)
├── modules/                      # Optional Feature modules (afk, raids, etc.)
│   └── {module}/
│       ├── index.ts              # Extends Module base class, registers module service
│       ├── commands/             # Feature slash commands
│       ├── lib/                  # Feature-specific logic (settings, helpers)
│       └── listeners/            # Feature event listeners
├── utilities/                    # Framework-free utilities & UI cards
│   ├── branding.ts               # Core visual tokens (colors, icons)
│   ├── cards.ts                  # UI Factories (Success, Error, List cards)
│   ├── formatting.ts             # Time, size, ID, and percentage helpers
│   ├── gdpr.ts                   # Standard data deletion types
│   ├── time.ts                   # Sleep and date helper functions
│   └── resolvers/                # Duration and fuzzy search input resolvers
└── workers/                      # Asynchronous job workers
    ├── WorkerManager.ts          # Worker controller/manager
    └── scripts/                  # Background worker task scripts
```

## Key Commands

| Task | Command |
| :--- | :--- |
| **Dev Mode** | `bun run dev` (hot reload) |
| **Type Check** | `bun run typecheck` |
| **Lint** | `bun run lint` |
| **Generate Client** | `bun run db:generate` |
| **Push Schema** | `bun run db:push` |
| **Run Migrations** | `bun run db:migrate` |
| **DB Studio** | `bun run db:studio` |

## RPC Actions (Dashboard Integration)

| Category | Action | Description |
| :--- | :--- | :--- |
| **Guild** | `guild.config.get` / `set` | Manage core guild settings (prefix, roles) |
| | `guild.modules.list` | Get module statuses for a guild |
| | `guild.module.enable` / `disable` | Toggle modules per guild |
| | `guild.permissions.list` | Get all permission overrides |
| | `guild.permissions.set` / `clear` | Manage specific command overrides |
| | `guild.member.permissions` | Get a member's resolved permission level |
| **Bot** | `bot.stats.get` | Uptime, guild count, user count, ping |
| | `bot.guilds.list` | List all guilds the bot is in |
| | `bot.permissions.levels` | Available PermissionLevel IDs and Names |
| | `bot.permissions.model-types` | Valid override targets (role, user, etc.) |
| | `bot.commands.list` | All registered commands and subcommands |
| **Global** | `global.config.set` | Manage global bot configuration |
| | `global.module.enable` / `disable` | Enable/disable modules globally |
| | `global.maintenance.set` | Toggle maintenance mode |

## Documentation References

- **CLAUDE.md:** Exhaustive reference for architecture, patterns, and "Four Golden Rules".
- **prisma/schema.prisma:** Single source of truth for the database schema.
