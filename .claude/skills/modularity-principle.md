# Modularity Principle

**Apply this test before writing or porting any file.**

---

## The Test

Ask three questions before writing any piece of code:

### 1. Is it modular?
Can this be loaded/unloaded without touching anything else?

- **YES** → proceed
- **NO** → redesign the boundaries first

### 2. Is the TypeScript version better than the Python version?
Not "equivalent" — *better*. Typed, lean, no workarounds for language limitations.

- **YES** → port/write it
- **NO** → throw it out or redesign

### 3. Does it belong in core or in a module?

| Belongs in `src/lib/` or `src/core/` | Belongs in `src/modules/{name}/` |
|---|---|
| Used by 3+ modules | Used by exactly one feature |
| Framework plumbing (preconditions, cards, RPC) | Business logic (birthday logic, mod case creation) |
| DB/Redis client setup | Module-specific schema and Redis keys |

---

## What Was Thrown Out (and Why)

| Python piece | Reason thrown out |
|---|---|
| `BaseDriver` + multi-backend abstraction | Postgres-only. Abstraction adds cost with zero benefit. |
| `CogDownloader` (hot-reload from URL) | Red-DiscordBot-ism. DevOps workflow, not bot logic. |
| `make_setup()` classmethod | Sapphire auto-scans directories. No setup boilerplate needed. |
| `RPCMixin` (JSON-RPC over HTTP) | Replaced by Redis pub/sub. Works across shards, no new ports. |
| `_convert_to_snake_case` string magic | Sapphire Pieces have mandatory `name` property. No magic needed. |
| `PermState` 5-state transition table | Red-DiscordBot over-engineering. Replaced by simple boolean overrides. |
| `owner_group`/`admin_group` factories | Sapphire has Preconditions. No group factories needed. |
| `Store.get_cascading` | Each module owns typed tables. Cascading reads are explicit SQL. |
| `tasks.Loop` auto-management | `@sapphire/plugin-scheduled-tasks` (BullMQ on Redis). Persists across restarts. |
| `@defer()` decorator | Sapphire handles deferred responses in the framework layer. |
| `@feature()` decorator (class mutation) | Static `meta` property + `ModuleRegistry`. No method patching. |
| In-process LRU `_ReadCache` | Redis. Works across shards, survives restarts. |

---

## What Was Kept and Why

| Python piece | TypeScript equivalent | Why kept |
|---|---|---|
| `EmberError` hierarchy | `src/core/errors.ts` | Clean 1:1, adds value in any language |
| `PermissionLevel` enum | `src/core/permissions.ts` | Good model, just simplified |
| `EmberColors`/`EmberIcons` | `src/core/branding.ts` | Pure data, zero migration cost |
| Card factory pattern | `src/lib/util/cards.ts` | Keeps DX consistent; replaced LayoutView with EmbedBuilder |
| Per-guild config isolation | Per-module Postgres tables | Kept the concept, improved the implementation |
| Document store pattern | Module-owned tables | Kept the concept, now typed and queryable |
| GDPR `delete_user_data` | Abstract method on module base | Legal requirement, keep it |

---

## The Modularity Contract

Every module in `src/modules/{name}/` MUST:
1. Export a static `meta: ModuleMeta` with display name, emoji, description, config fields
2. Declare its own Postgres schema in `lib/schema.ts`
3. Declare its own Redis key helpers in `lib/redis.ts`
4. Register RPC handlers for any data it owns (so the dashboard can read/write it)
5. Implement `deleteUserData(userId: bigint): Promise<void>` (GDPR)
6. Have zero imports from other modules (only from `#lib/`, `#core/`, `#db/`, `#redis/`)

A module that imports from another module is not modular — break the coupling.
