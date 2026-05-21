# Ember TypeScript — Claude Code Reference

Ember is a modular Discord bot built with **Sapphire Framework v5**, **discord.js v14**, **Prisma ORM**, and **ioredis**. Runtime is **Bun** (fast JS/TS runtime — replaces Node for dev and production).

---

## Quick orientation

```
src/
  main.ts                       Entry point: DB connect → RPC bridge → client.login()
  EmberClient.ts                createEmberClient() + startRpcBridge()
  core/
    branding.ts                 EmberColors, EmberIcons constants
    errors.ts                   Typed error hierarchy (throw these, never send manually)
    permissions.ts              PermissionLevel enum + resolvePermissionLevel()
  lib/
    extensions/EmberCommand.ts  Base class for all commands (replySuccess / replyError etc.)
    structures/ModuleRegistry.ts ModuleMeta registry — owns GDPR delete
    structures/AntiSpam.ts      Sliding-window spam detection
    types/Augments.ts         Container / ScheduledTasks / Env type augmentation
    util/cards.ts               ALL UI — makeSuccessCard, makeListCard, etc.
    util/formatting.ts          humanizeDuration, snowflakeToDate, etc.
    setup/                      env.ts, redis.ts, all.ts (imported first)
  db/
    index.ts                    PrismaClient instance + getPrisma()
  redis/
    index.ts                    createRedisClient()
    keys.ts                     RedisKeys + RedisTTL — single source of truth
    rpc.ts                      createRpcBridge() + registerRpcHandler()
  commands/admin/               /config and /permissions commands
  preconditions/                GuildOnly, ModuleEnabled, MinimumPermissionLevel, etc.
  listeners/                    ready.ts, guildCreate.ts
  modules/                      Feature modules (raids, afk, …)

prisma/
  schema.prisma                 Single source of truth for the database schema
```

---

## Runtime: Bun

This project runs on **[Bun](https://bun.sh)** — not Node. Bun understands TypeScript natively (no compile step needed in dev), is faster for startup and I/O, and is fully compatible with the npm ecosystem used here.

### Scripts

```jsonc
// package.json scripts
"dev":        "bun --hot src/main.ts",            // hot-reload dev server, no compile
"start":      "bun src/main.ts",                  // production (Bun runs TS directly)
"build":      "bun build src/main.ts --outdir dist --target bun",  // optional bundle
"typecheck":  "tsc --noEmit -p src/tsconfig.json",
"lint":       "eslint src --ext ts --fix",
"db:generate":"prisma generate",
"db:push":    "prisma db push",
"db:migrate": "prisma migrate dev",
"db:studio":  "prisma studio"
```

---

## Four golden rules

1. **Never `new EmbedBuilder()`** — every user-facing reply goes through `lib/util/cards.ts` factories.
2. **Use `container.prisma` directly** — all database access goes through Prisma Client. No more wrapper slop.
3. **All slash commands in groups** — `/birthday set`, never `/birthday_set`. Prefix commands are reserved for owner/admin tooling and a small number of legacy modules (AFK).
4. **Throw errors, never send them** — `src/listeners/errors.ts` catches typed errors and renders the right card.

---

## Module system

Each feature lives in `src/modules/{name}/`. Zero coupling across modules.

### Module isolation rules

- No imports from sibling modules (`raids` must not import from `afk`)
- Each module owns its own concrete Prisma tables (if needed) and Redis key namespace
- All user data must be deletable via `deleteUserData(userId, requester: RequesterType)` (GDPR)
- New ScheduledTask names must be declared in `Augments.ts`

### GDPR / data deletion

`deleteUserData(userId, requester: RequesterType)` — modules receive the `RequesterType` so they can decide retention policy.
- `USER` may keep moderation/audit records.
- `USER_STRICT` and `DISCORD_DELETED_USER` should purge everything.
- Moderation cases are **anonymized** (userId → `'0'`), never deleted — audit trail must be preserved.

---

## Database — Prisma ORM

All persistent state goes through `container.prisma`. The schema is defined in `prisma/schema.prisma`.

### Common Patterns

```typescript
import { container } from '@sapphire/framework';

// Fetch guild config
const cfg = await container.prisma.guildConfig.findUnique({ where: { guildId } });

// Upsert module config
await container.prisma.moduleGuildConfig.upsert({
  where: { guildId_moduleName_configKey: { guildId, moduleName: 'afk', configKey: 'enabled' } },
  update: { value: true },
  create: { guildId, moduleName: 'afk', configKey: 'enabled', value: true }
});

// Use concrete tables for module data
await container.prisma.afkEntry.create({
  data: { userId, guildId, reason: 'Lunch', since: new Date() }
});
```

### Discord Snowflakes

Snowflakes are stored as `String` in the database but mapped to `text` or `varchar` in Postgres. Use `BigInt` only if mathematical operations are required (rare).

---

## Redis

All keys flow through `RedisKeys` in `src/redis/keys.ts`. **Never hard-code a key string.**

---

## RPC Bridge (bot ↔ dashboard)

Register handlers in `src/redis/rpc.ts`. All handlers work over both Redis and RabbitMQ transports.

---

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `BOT_TOKEN` | yes | Discord bot token |
| `CLIENT_ID` | yes | Discord application client ID |
| `POSTGRES_URL` | yes | `postgresql://user:pass@host/db` |
| `REDIS_HOST` | yes | Redis hostname |
| `REDIS_PORT` | yes | Redis port (default 6379) |
| `OWNER_IDS` | no | Comma-separated Discord user IDs for BOT_OWNER level |
| `RABBITMQ_URL` | no | `amqp://user:pass@host:5672` — enables RabbitMQ |

---

## What NOT to do

- **`new EmbedBuilder()`** — always use card factories from `#lib/util/cards.js`
- **Hard-coded Redis key strings** — always use `RedisKeys.*` from `#redis/keys.js`
- **`awaitMessageComponent()`** — use an `InteractionHandler` piece instead
- **Cross-module imports** — modules may not import from a sibling module.
- **Prefix commands for new user features** — prefer slash.
- **`node` to run the project** — use `bun` (reads TypeScript directly, no compile needed)
