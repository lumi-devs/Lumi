# Ember — Modular Discord Bot (TypeScript / Sapphire / Bun)

Ember is a modular Discord bot built with the **Sapphire Framework v5**, **discord.js v14**, and the **Bun** runtime. It uses **Prisma ORM** for database access, **Redis** for caching and RPC, and **RabbitMQ** for an event bus and job queue.

## Project Overview

- **Runtime:** [Bun](https://bun.sh) (runs TypeScript directly, no compile step needed).
- **Framework:** [Sapphire Framework](https://www.sapphirejs.dev/) (modular, piece-based architecture).
- **Database:** [Prisma ORM](https://www.prisma.io/) with Postgres.
- **Messaging:** Redis (caching/RPC) and RabbitMQ (events/jobs).
- **Architecture:** Feature-based modularity. Each feature lives in `src/modules/{name}/` and is isolated from others.

## Core Mandates & Rules

1.  **Never `new EmbedBuilder()`:** Use UI factories in `src/lib/util/cards.ts` (`makeSuccessCard`, `makeErrorCard`, etc.).
2.  **Prisma Everywhere:** Always use `this.container.prisma`. The schema is central and strictly typed.
3.  **Modular Isolation:** Modules in `src/modules/` must not import from each other. Shared logic goes in `src/lib/`.
4.  **Error Handling:** Throw typed errors from `src/core/errors.ts`. A global listener catches and renders them as error cards.
5.  **Slash Commands First:** All user-facing features must be slash commands. Prefix commands (`,`) are for admin/owner tools.
6.  **Redis Keys:** Never hardcode strings. Use `RedisKeys` from `src/redis/keys.ts`.

## Project Structure

```text
src/
├── main.ts                       # Entry point: DB connect -> RPC -> login
├── EmberClient.ts                # Client initialization & RabbitMQ setup
├── core/                         # Branding, Typed Errors, Permissions
├── db/                           # Prisma client initialization
├── lib/                          # Extensions, shared structures, utils
│   ├── extensions/EmberCommand.ts # Base class for all commands
│   └── setup/                    # Initialization (env, redis, etc.)
├── modules/                      # Feature modules (afk, raids, etc.)
│   └── {module}/
│       ├── index.ts              # Module metadata & lifecycle hooks
│       ├── commands/             # Slash commands
│       ├── lib/                  # Module-specific logic
│       └── listeners/            # Event listeners
├── redis/                        # Redis client & RPC bridge
└── rabbitmq/                     # RabbitMQ manager & job handlers

prisma/
├── schema.prisma                 # Database schema definition
└── migrations/                   # SQL migration history
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
| **Build** | `bun run build` |

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
