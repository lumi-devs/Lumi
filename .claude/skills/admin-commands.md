# Admin Commands

Two built-in admin slash commands: `/config` and `/permissions`. Both live in
`src/commands/admin/` and operate at guild scope only.

---

## `/config`

**File:** `src/commands/admin/config.ts`
**Permission gate:** `PermissionLevel.GUILD_OWNER` minimum
**All responses:** ephemeral

### Subcommands

| Subcommand | Description |
|---|---|
| `list` | Show all modules, their enabled state, and configured field values |
| `get {module} {key}` | Show a single config value |
| `set {module} {key} {value}` | Write a value, invalidate Redis cache |
| `enable {module}` | Enable module for this guild |
| `disable {module}` | Disable module for this guild |

### How it reads module metadata

```typescript
const modules = container.moduleRegistry.getAll(); // ModuleMeta[]
// Each ModuleMeta.configFields drives the /config set option autocomplete
```

### Read / write flow

```typescript
// Read all values for a module
import { moduleGuildConfig } from '#db/schema/core.js';
import { and, eq } from 'drizzle-orm';
import { RedisKeys, RedisTTL } from '#redis/keys.js';

const key = RedisKeys.guildConfig(moduleName, guildId);
const cached = await container.redis.get(key);
if (cached) {
  cfg = JSON.parse(cached);
} else {
  const rows = await container.db
    .select()
    .from(moduleGuildConfig)
    .where(and(eq(moduleGuildConfig.guildId, BigInt(guildId)), eq(moduleGuildConfig.moduleName, moduleName)));
  cfg = Object.fromEntries(rows.map((r) => [r.configKey, r.valueJson]));
  await container.redis.setex(key, RedisTTL.guildConfig, JSON.stringify(cfg));
}

// Write a value (upsert), then invalidate
await container.db
  .insert(moduleGuildConfig)
  .values({ guildId: BigInt(guildId), moduleName, configKey: key, valueJson: value, updatedAt: new Date() })
  .onConflictDoUpdate({
    target: [moduleGuildConfig.guildId, moduleGuildConfig.moduleName, moduleGuildConfig.configKey],
    set: { valueJson: value, updatedAt: new Date() },
  });
await container.redis.del(RedisKeys.guildConfig(moduleName, guildId));
```

See `config-system.md` for the full storage spec and field type rules.

---

## `/permissions`

**File:** `src/commands/admin/permissions.ts`
**Permission gate:** `PermissionLevel.ADMIN` minimum
**All responses:** ephemeral

### Subcommands

| Subcommand | Description |
|---|---|
| `allow {command} {type} {target}` | Add an allow override |
| `deny {command} {type} {target}` | Add a deny override |
| `reset {command} [{type} {target}]` | Delete matching override(s) |
| `list [{command}]` | Show overrides for a command or all |

### Model types

| `model_type` | `model_id` | Notes |
|---|---|---|
| `role` | Role snowflake | Discord role ID |
| `user` | User snowflake | Discord user ID |
| `channel` | Channel snowflake | Discord channel ID |
| `everyone` | `0n` | Applies to all guild members |

`everyone` uses `modelId = 0n` so it fits the same PK structure as the typed rows.

### Write pattern

```typescript
import { permissionOverrides } from '#db/schema/core.js';
import { RedisKeys } from '#redis/keys.js';

// Upsert an override
await container.db
  .insert(permissionOverrides)
  .values({ guildId: BigInt(guildId), commandPath, modelType, modelId, allow, updatedAt: new Date() })
  .onConflictDoUpdate({
    target: [permissionOverrides.guildId, permissionOverrides.commandPath, permissionOverrides.modelType, permissionOverrides.modelId],
    set: { allow, updatedAt: new Date() },
  });

// Always invalidate after any write
await container.redis.del(RedisKeys.permOverrides(commandPath, guildId));
```

### Command path format

```
{commandName}                           ← top-level command
{commandName}:{subgroup}:{subcommand}  ← subcommand
mod:*                                  ← wildcard: all commands in module
*                                      ← wildcard: every command
```

Examples: `birthday:birthday:set`, `mod:mod:ban`, `permissions:permissions:allow`

### Override priority (highest → lowest)

1. User deny
2. User allow
3. Channel deny
4. Channel allow
5. Role deny (any matching role)
6. Role allow (any matching role)
7. Everyone deny
8. Everyone allow
9. No match → `MinimumPermissionLevel` result stands

---

## `PermissionOverrides` Precondition

**File:** `src/preconditions/PermissionOverrides.ts`

Fetches all overrides for `(commandPath, guildId)` from Postgres, cached in Redis.

| Redis key | TTL | Value |
|---|---|---|
| `ember:perms:{commandPath}:{guildId}` | 120s | `JSON.stringify(PermissionOverride[])` |

```typescript
// The precondition always passes for BOT_OWNER — check before any override logic
if (resolvedLevel >= PermissionLevel.BOT_OWNER) return this.ok();

// Invalidated immediately after any /permissions write — 120s TTL is a fallback only
```

**Placement in precondition list:** after `MinimumPermissionLevel`, always last.

```typescript
preconditions: [
  'GuildOnly',
  'NotIgnored',
  'NotBlocked',
  'ModuleEnabled',
  ['MinimumPermissionLevel', PermissionLevel.MOD],
  'PermissionOverrides',   // ← always last
]
```

---

## `NotIgnored` Precondition

**File:** `src/preconditions/NotIgnored.ts`

Checks `ignoreList` table. Two separate keys — guild-level and channel-level — both checked.

| Redis key | TTL | Value |
|---|---|---|
| `ember:ignore:guild:{guildId}` | 300s | `'1'` = ignored, `'0'` = not ignored |
| `ember:ignore:channel:{guildId}:{channelId}` | 300s | `'1'` = ignored, `'0'` = not ignored |

Both `'1'` and `'0'` are cached explicitly so a non-ignored guild/channel does not hit Postgres
on every command (a cache miss on a hot path would mean a DB query for every interaction).

**Placement:** near the top of the precondition list, before any permission checks.

```typescript
preconditions: [
  'GuildOnly',
  'NotIgnored',   // ← near top
  'NotBlocked',
  ...
]
```
