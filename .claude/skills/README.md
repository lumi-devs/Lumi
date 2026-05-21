# Ember TypeScript — Active Skills

> **Read CLAUDE.md first** (project root) — it is the single source of truth for patterns.
> Skills below provide deeper detail for each area.

## Core Principle (read this first)
**`modularity-principle.md`** — The "is this modular + better?" test applied before every file is written.

## Runtime
This project runs on **Bun** — not Node. Dev: `bun --hot src/main.ts`. No compile step.

| Skill | File | Purpose |
|---|---|---|
| Bun Runtime | `bun-runtime.md` | Scripts, import aliases, Docker, compatibility table, BullMQ caveat |

## Architecture
| Skill | File | Purpose |
|---|---|---|
| Modularity Principle | `modularity-principle.md` | The filter applied before porting anything from Python |
| Sapphire Patterns | `sapphire-patterns.md` | Pieces, Container, lifecycle, ScheduledTask, InteractionHandler |
| Module System | `ember-module-system.md` | How to write an EmberModule: structure, meta, schema, redis keys |
| Permissions System | `permissions-system.md` | PermissionLevel, per-command overrides, Preconditions, guild config |
| RPC Bridge | `rpc-bridge.md` | Redis pub/sub bot↔dashboard, actions, envelope format |

## Storage
| Skill | File | Purpose |
|---|---|---|
| Postgres + Drizzle | `postgres-drizzle.md` | Schema design rules, module-owned tables, migrations, query patterns |
| Redis Patterns | `redis-patterns.md` | Key namespacing, TTLs, sliding windows, pub/sub, cache-aside |

## UI
| Skill | File | Purpose |
|---|---|---|
| Cards & UI | `cards-ui.md` | makeSuccessCard, makeConfirmCard, makeListCard — never raw Embed |

## Admin & Config
| Skill | File | Purpose |
|---|---|---|
| Config System | `config-system.md` | module_guild_config KV store, ConfigField types, Redis cache-aside, enable/disable |
| Admin Commands | `admin-commands.md` | /config and /permissions subcommands, PermissionOverrides precondition, NotIgnored precondition |

## Sapphire Ecosystem
| Skill | File | Purpose |
|---|---|---|
| Sapphire Full Ecosystem | `sapphire-ecosystem.md` | All @sapphire/* packages, when to use each, PaginatedMessage, decorators, scheduled tasks |

## Claude Agent Cost Guide

When spawning advisor or worker agents in this project:

| Task | Model | Reason |
|---|---|---|
| Schema stubs, command boilerplate | Haiku | Mechanical generation, low complexity |
| Dependency/bundle analysis | Haiku | Lookup tasks, fast response |
| Code review passes | Haiku | Pattern matching, not deep reasoning |
| Architecture decisions | Sonnet | Requires context and judgment |
| Complex business logic | Sonnet | Multi-step reasoning needed |
| New core system design | Sonnet | Broad codebase impact |

## Downloaded (generic)
| Skill | Source | Purpose |
|---|---|---|
| `discord-bot-architect` | `~/.claude/skills/discord-bot-architect/` | discord.js v14 patterns, intents, components |
| `code-review-and-quality` | `~/.claude/skills/code-review-and-quality/` | 5-axis review |
| `git-commit` | `~/.claude/skills/git-commit/` | Conventional commits workflow |
