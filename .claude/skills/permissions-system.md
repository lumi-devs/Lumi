# Permissions System

Two-layer system: PermissionLevel (fast, role-based) + per-command overrides (flexible, persisted).

---

## PermissionLevel Hierarchy

```typescript
const enum PermissionLevel {
  USER = 0,        // Regular member
  MOD = 1,         // Manage messages OR configured mod role
  ADMIN = 2,       // Administrator permission OR configured admin role
  GUILD_OWNER = 3, // Guild owner
  BOT_OWNER = 4,   // In OWNER_IDS env var — bypasses everything
}
```

Resolution order (from `src/core/permissions.ts`):
1. `OWNER_IDS` env var → `BOT_OWNER`
2. `guild.ownerId === userId` → `GUILD_OWNER`
3. `member.permissions.has('Administrator')` → `ADMIN`
4. `member.roles.cache.has(coreGuildConfig.adminRoleId)` → `ADMIN`
5. `member.permissions.has('ManageMessages')` → `MOD`
6. `member.roles.cache.has(coreGuildConfig.modRoleId)` → `MOD`
7. Everyone else → `USER`

---

## Per-Command Overrides

Stored in `permission_overrides` table. Cached in Redis at `ember:perms:{commandPath}:{guildId}`.

```
model_type: 'role' | 'user' | 'channel' | 'everyone'
model_id:   Discord ID of the role/user/channel
allow:      true (allow) | false (deny)
command_path: 'birthday:birthday:set' | 'mod:*' | '*'
```

**Precedence**: explicit deny > explicit allow > PermissionLevel default.

Usage via `/permissions`:
```
/permissions allow command:mod-ban role:@Moderators
/permissions deny  command:mod-ban user:@TroubleMaker
/permissions reset command:mod-ban
/permissions list
```

---

## Sapphire Preconditions

```typescript
// Applied on every command:
preconditions: [
  'GuildOnly',                                         // reject DMs
  'NotIgnored',                                        // guild/channel ignore list
  'NotBlocked',                                        // user blocklist
  'ModuleEnabled',                                     // module on/off per guild
  ['MinimumPermissionLevel', PermissionLevel.MOD],    // level gate
  'PermissionOverrides',                               // runtime overrides (applied last)
]
```

### MinimumPermissionLevel
Checks `resolvePermissionLevel(interaction) >= required`. Reads mod/admin role IDs from Redis-cached guild config.

### PermissionOverrides
Fetches overrides from Redis (120s TTL from Postgres). Checks in order:
1. user-specific override for this command → allow/deny
2. role overrides (any of user's roles) → deny takes precedence over allow
3. channel override → allow/deny
4. everyone override → allow/deny
5. No match → PermissionLevel default wins

### ModuleEnabled
Checks Redis key `ember:module:enabled:{module}:{guildId}`. Absent = enabled (default).

---

## Guild Config for Permissions

Set via `/config` or via RPC (`guild.config.set`):
```
coreGuildConfig.modRoleId   → which role counts as MOD
coreGuildConfig.adminRoleId → which role counts as ADMIN
```

Global config (bot owner via RPC `global.config.set`):
```
globalConfig.maintenanceMode → blocks all commands for non-owners
```

---

## Command Path Format

`{moduleName}:{commandName}:{subcommandName}`

Examples:
- `birthday:birthday:set`
- `mod:mod:ban`
- `permissions:permissions:allow`
- `mod:*` — all mod module commands
- `*` — every command

---

## Rules

- **Always use `preconditions` on the Command** — never check permissions in command body
- **`BOT_OWNER` bypasses all preconditions** — enforced in global interaction check
- **Permission level resolution reads from Redis-cached guild config** — fast, no DB hit per command
- **Override cache TTL = 120s** — invalidated immediately on `/permissions` change
- **`allow: false`** (deny) always wins over `allow: true` when both match the same user
- **Dashboard can manage overrides via RPC** — same Postgres table, Redis cache invalidated
