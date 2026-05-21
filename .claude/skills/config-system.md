# Config System

Module config is a generic KV store backed by `module_guild_config`. The `/config` command surfaces
registered fields to guild owners without any per-module command code.

---

## How Modules Register Config Fields

In `src/modules/{name}/index.ts`, export a `ModuleMeta` with `configFields`:

```typescript
import type { ModuleMeta } from '#lib/structures/ModuleRegistry.js';
import { FieldType } from '#lib/structures/ModuleRegistry.js';

export const meta: ModuleMeta = {
  name: 'birthday',
  displayName: 'Birthday',
  emoji: '🎂',
  description: 'Announce member birthdays on a configured channel.',
  configFields: [
    {
      key: 'channelId',
      label: 'Announcement Channel',
      type: FieldType.CHANNEL,
      required: true,
      description: 'Where birthday announcements are posted',
    },
    {
      key: 'message',
      label: 'Birthday Message',
      type: FieldType.TEXT,
      default: '🎂 Happy birthday {user}!',
    },
    { key: 'enabled', label: 'Enabled', type: FieldType.BOOLEAN, default: true },
  ],
};
```

`ModuleRegistry.register(meta)` is called automatically when any Piece from the module loads.
`/config list` and `/config set` read from `container.moduleRegistry.getAll()`.

---

## ConfigField Types

| `FieldType` | Discord option type | Notes |
|---|---|---|
| `CHANNEL` | Channel mention | Value stored as channel ID string |
| `ROLE` | Role mention | Value stored as role ID string |
| `TEXT` | String | Free text, max 1000 chars |
| `BOOLEAN` | String `true`/`false` | `/config set module key true` |
| `NUMBER` | Integer | Validated as finite integer |
| `ENUM` | String | Must provide `choices: string[]`; validated on write |

---

## Storage: `module_guild_config`

```
(guild_id, module_name, config_key, value_json)  ← composite PK
```

Generic JSON KV — one row per field per guild. No schema migration needed when adding a new
`ConfigField`; the row just doesn't exist until the guild owner sets it.

```typescript
import { moduleGuildConfig } from '#db/schema/core.js';
import { and, eq } from 'drizzle-orm';

// Fetch all config values for a module in one query
const rows = await container.db
  .select()
  .from(moduleGuildConfig)
  .where(
    and(
      eq(moduleGuildConfig.guildId, BigInt(guildId)),
      eq(moduleGuildConfig.moduleName, 'birthday'),
    ),
  );

const cfg = Object.fromEntries(rows.map((r) => [r.configKey, r.valueJson]));
const channelId = cfg['channelId'] as string | null;
```

Write a single key (upsert):

```typescript
await container.db
  .insert(moduleGuildConfig)
  .values({
    guildId: BigInt(guildId),
    moduleName: 'birthday',
    configKey: 'channelId',
    valueJson: channelId,
    updatedAt: new Date(),
  })
  .onConflictDoUpdate({
    target: [moduleGuildConfig.guildId, moduleGuildConfig.moduleName, moduleGuildConfig.configKey],
    set: { valueJson: channelId, updatedAt: new Date() },
  });
```

---

## Redis Cache (config values)

Full config object (all keys for one module + guild) is cached as a JSON string.

| Key | TTL | Value |
|---|---|---|
| `ember:cfg:{module}:guild:{guildId}` | 60s | `JSON.stringify(cfg)` where `cfg` is the `Object.fromEntries` map |

```typescript
import { RedisKeys, RedisTTL } from '#redis/keys.js';

// Read-through
const key = RedisKeys.guildConfig('birthday', guildId);
const cached = await container.redis.get(key);
if (cached) return JSON.parse(cached) as Record<string, unknown>;

// ... DB query ...
await container.redis.setex(key, RedisTTL.guildConfig, JSON.stringify(cfg));
```

Cache invalidation — call after every write:

```typescript
await container.redis.del(RedisKeys.guildConfig('birthday', guildId));
```

---

## Module Enable/Disable

Separate from config values — stored in `module_guild_state` table and cached without a TTL.

| Layer | Key / Column | Absent means |
|---|---|---|
| Postgres | `module_guild_state(guild_id, module_name, enabled)` | Row missing = enabled |
| Redis | `ember:module:enabled:{module}:{guildId}` | Key absent = enabled |

The `ModuleEnabled` precondition checks the Redis key. The `/config enable` and `/config disable`
subcommands write to Postgres and then set/del the Redis key directly (no TTL).

```typescript
// Enable
await container.redis.del(RedisKeys.moduleEnabled(moduleName, guildId));

// Disable — write string '0' so absence still means enabled
await container.redis.set(RedisKeys.moduleEnabled(moduleName, guildId), '0');
```

---

## Command Path Format

```
/config list                             → show all modules + current enable state
/config get {module} {key}              → show a single config value
/config set {module} {key} {value}      → write + invalidate cache
/config enable {module}                 → enable module for this guild
/config disable {module}                → disable module for this guild
```

---

## Rules

- **Use `module_guild_config` for all values surfaced by `/config`** — don't create a parallel
  per-module config table for settings the guild owner can change.
- **Typed per-module tables are for domain records only** — e.g., `birthday_entries` (user data),
  not `birthday_guild_config` (channel, message template). The one exception: if a module needs
  a multi-column typed join query, a typed config table is acceptable but must not duplicate
  any field already in `module_guild_config`.
- **Always invalidate the Redis key after a write** — the TTL (60s) is not a substitute for
  cache invalidation; stale config causes user-visible bugs.
- **`required: true` fields with no value should surface a clear error** — the module is
  responsible for checking; `module_guild_config` has no notion of required at the DB level.
- **`FieldType.ENUM` requires `choices`** — the `/config set` handler validates the value
  against `choices` before writing; the module does not need to re-validate.
