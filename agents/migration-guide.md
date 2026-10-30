# Migration Guide: Lumi v1 → v2

This guide covers breaking changes and migration steps for moving from Lumi v1 to v2.

## Overview of Major Changes

| Area             | v1                                | v2                                                            |
| ---------------- | --------------------------------- | ------------------------------------------------------------- |
| **Architecture** | Single process, monolithic        | Monorepo, single process (fleet ready)                        |
| **Modules**      | `core` (essential) + toggleable   | Built-in services + fully toggleable modules                  |
| **Permissions**  | Tier-based (admin/mod/user)       | Permit system: node-based, time/channel/role conditions       |
| **Config**       | Guild settings JSON               | Zod-validated per-module config in `Guild.settings`           |
| **Database**     | Custom migrations, idempotent DDL | Prisma with versioned migrations                              |
| **Cache**        | In-memory only                    | L1 LRU + Redis L2 with invalidation bus                       |
| **RPC**          | None                              | Token-guarded HTTP control server                             |
| **Images**       | Sharp/SVG rank cards              | Canvas (rank + balance + shop cards)                          |
| **Addons**       | Basic git installer               | Validated git repo manager: installs, updates, pins, rollback |
| **Boot**         | Global container, import-time DI  | Explicit composition root, no global state                    |

---

## Breaking Changes

### 1. No More `core` Module

**v1:** `core` module was essential/undeletable, contained base commands, config, etc.

**v2:** Built-in services in `src/`:

- `core/` — Gateway, lifecycle, interaction/prefix dispatch, RPC control server,
  service wiring
- `admin/` — Module management, `lumi` panel, owner commands

**Migration:**

- Remove `core` from module list
- Built-in controls always available (`/lumi` hub, `/ping`)
- Config moved to per-module Zod schemas

### 2. Permission System Replaced

**v1:** Tier-based (Bot Owner → Admin → Mod → User → Everyone)

**v2:** Permit system:

- Node-based: `mod.ban`, `economy.shop`, `*`
- Polarity: `Grant` / `Deny`
- Priority: position in chain
- Conditions: channels, roles, time windows, cron schedules
- Expiry: time-based with auto-cleanup

**Migration:**

```ts
// v1: tier check
if (userTier >= Tier.Mod) { ... }

// v2: evaluate a permit node
const allowed = (
  await services.permits.explainPermit(
    {
      guildId: interaction.guildId!,
      userId: interaction.user.id,
      channelId: interaction.channelId,
      roleIds: member.roles.cache.map((r) => r.id),
      permitNode: "mod.ban",
    },
    services.client,
  )
).allowed;
```

### 3. Module System Overhaul

**v1:** Modules in `src/modules/`, global container, dynamic imports

**v2:** Modules in `modules/`, explicit loader, manifest-based

| v1                          | v2                                          |
| --------------------------- | ------------------------------------------- |
| `src/modules/mod/`          | `modules/moderation/mod/`                   |
| `module.ts` with `setup()`  | `manifest.json` + `index.ts`                |
| Global `container`          | `services` passed to each module            |
| `config.enabled` per guild  | `services.modules.isEnabled(guildId, name)` |
| Essential/disableable flags | All modules toggleable                      |

**Migration:**

```ts
// v1 module structure
export const ModModule: Module = {
  name: "mod",
  setup(container) { ... },
  config: { enabled: true },
};

// v2 module structure (modules/moderation/mod/index.ts)
export default defineModule({
  name: "moderation-mod",
  config: z.object({ ... }),
  commands: [banCmd, kickCmd, ...],
  listeners: [modLogListener],
  async onLoad(services) { ... },
});
```

### 4. Database: Prisma Only

**v1:** Custom migration runner, idempotent DDL, raw SQL repositories

**v2:** Prisma Client, versioned migrations, typed repositories

**Migration:**

```bash
# 1. Export v1 data (if needed)
# 2. Run v2 migrations
bun run db:migrate

# 3. Use Prisma Client
const user = await services.db.prisma.economyUser.findUnique({
  where: { guildId_userId: { guildId, userId } },
});
```

### 5. Cache: Two-Tier with Invalidation

**v1:** In-memory `Map` with TTL

**v2:** L1 (LRU, in-process) + L2 (Redis) + Invalidation Bus

**Migration:** modules do not own a cache. Read and write guild settings through
`services.config`; the shared cache is constructed in `src/core/services.ts` and
owned by the `ConfigService`.

```ts
// v1
const cached = cache.get(key);
cache.set(key, value, 60000);

// v2
const settings = await services.config.get(guildId, "my-module");
await services.config.set(guildId, "my-module", settings);
// ConfigService caches and invalidates through the shared cache.
```

### 6. Commands: Permit Nodes

**v1:** Tier checks inside command

**v2:** `requiredPermit` maps a command to a permit node for the catalog and
Explain Check; dispatch does not enforce it. Runtime gating is `requiresAdmin`
or an explicit permit check in `execute`.

```ts
// v2 command
export const banCmd: CommandDefinition = {
  data: new SlashCommandBuilder().setName("ban")...,
  requiredPermit: "mod.ban",  // Catalog metadata; evaluate permits yourself
  async execute(interaction, services) {
    // Module enablement still needed
    if (!services.modules.isEnabled(guildId, "moderation-mod")) return;
    ...
  },
};
```

### 7. No More i18n

**v1:** Full locale system with translations

**v2:** English only. Remove all `t()`, `locale`, `i18n` references.

### 8. No Redis Cluster/Sentinel

**v1:** Cluster and Sentinel client branches

**v2:** Single Redis endpoint. Multi-replica correctness via exact-key invalidation.

---

## Step-by-Step Migration

### 1. Backup Data

```bash
# Export v1 database
pg_dump -h localhost -U lumi v1_database > v1_backup.sql
```

### 2. Set Up v2

```bash
# Clone v2
git clone https://github.com/lumi/lumi-v2
cd lumi-v2

# Install deps
bun install

# Configure environment
cp .env.example .env
# Edit .env with your tokens, DB URL, Redis URL
```

### 3. Run Migrations

```bash
# This creates all v2 tables
bun run db:migrate
```

### 4. Migrate Data (Optional)

If you need to import v1 data, write a one-time script:

```ts
// scripts/migrate-v1.ts
import { PrismaClient } from "@prisma/client";

const v1 = new PrismaClient({ datasourceUrl: process.env.V1_DATABASE_URL });
const v2 = new PrismaClient();

// Example: migrate economy users
const v1Users = await v1.$queryRaw`SELECT * FROM economy_users`;
for (const u of v1Users) {
  await v2.economyUser.upsert({
    where: { guildId_userId: { guildId: u.guild_id, userId: u.user_id } },
    update: { balance: u.balance, bankBalance: u.bank_balance },
    create: {
      guildId: u.guild_id,
      userId: u.user_id,
      balance: u.balance,
      bankBalance: u.bank_balance,
    },
  });
}
```

### 5. Port Custom Modules

For each v1 custom module:

1. Create `modules/<name>/`
2. Write `manifest.json`
3. Port commands to v2 format
4. Port listeners to v2 format
5. Convert config to Zod schema
6. Add `configFields` to `manifest.json` for the UI
7. Test with `bun run typecheck`

### 6. Update Deploy

```bash
# Docker
docker build -t lumi:v2 .
docker run -d --env-file .env lumi:v2

# Or bare metal
bun run build
bun dist/index.js
```

---

## Config Mapping

| v1 Setting                     | v2 Location                                 |
| ------------------------------ | ------------------------------------------- |
| `guildSettings.prefix`         | Guild `prefix` setting (`/lumi` → Settings) |
| `guildSettings.modLogChannel`  | `logging` module log channels               |
| `guildSettings.welcomeChannel` | No direct equivalent (no welcome module)    |
| `guildSettings.levelUpChannel` | `community-leveling` → `announceChannel`    |
| `guildSettings.currencyName`   | `community-economy` → `currencyName`        |
| `guildSettings.autoModRules`   | `security-automod` heat filters             |
| `guildSettings.tempVcCategory` | `utility-tempvc` → `categoryId`             |

### Example: Economy Config Migration

```ts
// v1: flat guild settings
{ currencyName: "Coins", currencySymbol: "🪙", dailyAmount: 150 }

// v2: per-module Zod schema (modules/community/economy/config.ts)
config: z.object({
  currencyName: z.string().default("Credits"),
  currencySymbol: z.string().default("💰"),
  startingBalance: z.number().int().default(0),
  dailyAmount: z.number().int().min(0).default(100),
  // ...
})
```

---

## Permit Migration

### v1 Tiers → v2 Permits

| v1 Tier       | v2 Equivalent                                      |
| ------------- | -------------------------------------------------- |
| Bot Owner     | `OWNER_IDS` environment variable (global)          |
| Server Owner  | Implicit (guild owner bypass)                      |
| Extra Owner   | Built-in `Extra Owner` permit (`*`, guild)         |
| Trusted Admin | Built-in `Trusted Admin` permit (`admin.*`, guild) |
| Admin Role    | `admin.*` permit assigned to role                  |
| Mod Role      | `mod.*` permit assigned to role                    |
| DJ Role       | `music.*` permit assigned to role                  |
| Custom        | Custom permits with node patterns                  |

### Migration Script

```ts
// scripts/migrate-permits.ts
async function migratePermits(guildId: string) {
  // 1. Create built-in permits
  await permitRepo.createPermit({
    guildId,
    name: "Extra Owner",
    nodes: ["*"],
    polarity: "Grant",
    position: 0,
    builtin: true,
  });
  await permitRepo.createPermit({
    guildId,
    name: "Trusted Admin",
    nodes: ["admin.*"],
    polarity: "Grant",
    position: 1,
    builtin: true,
  });

  // 2. Migrate admin role
  const adminRole = await getOldAdminRole(guildId);
  if (adminRole) {
    const adminPermit = await permitRepo.createPermit({
      guildId,
      name: "Admin Role",
      nodes: ["admin.*"],
      polarity: "Grant",
      position: 10,
    });
    await permitRepo.assignPermit(
      adminPermit.id,
      "ROLE",
      adminRole,
      "migration",
    );
  }

  // 3. Migrate mod role
  const modRole = await getOldModRole(guildId);
  if (modRole) {
    const modPermit = await permitRepo.createPermit({
      guildId,
      name: "Mod Role",
      nodes: ["mod.*"],
      polarity: "Grant",
      position: 20,
    });
    await permitRepo.assignPermit(modPermit.id, "ROLE", modRole, "migration");
  }
}
```

---

## Common Issues

### "Module not found" after migration

- Ensure `modules/<name>/manifest.json` exists
- Check `apiVersion: 2`
- Verify `entry` path is correct
- Run `bun run build` to catch import errors

### "Permit check failed" on commands

- Add `requiredPermit` to command definition
- Ensure permit exists in DB
- Check permit position (lower = higher priority)

### "Config validation error"

- All config must match Zod schema
- Run `bun run typecheck` to catch type mismatches
- Defaults must be in schema, not code

### "Database connection failed"

- Check `DATABASE_URL` format: `postgresql://user:pass@host:5432/db?schema=public`
- Ensure Postgres 18+ is running
- Run `bun run db:migrate` to create tables

### "Redis connection failed"

- Check `REDIS_URL`, or `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD`
- Ensure Redis 8+ is running
- v2 uses single endpoint only

---

## Verification Checklist

- [ ] Bot starts without errors
- [ ] `/lumi` panel loads
- [ ] `/lumi` → Modules lists every module
- [ ] `/lumi` → Settings edits the prefix
- [ ] `/lumi` → Permissions opens the permit panel

- [ ] Built-in commands work (`/ping`, `/lumi`)
- [ ] Mod commands work (ban, kick, timeout, etc.)
- [ ] Economy commands work (balance, daily, shop, etc.)
- [ ] Leveling commands work (rank, leaderboard, rankcard)
- [ ] Filter auto-mod works
- [ ] TempVC creates channels
- [ ] Logging captures events
- [ ] Control server status responds
- [ ] Metrics at `/metrics`
- [ ] Health at `/healthz`

---

## Rollback Plan

If migration fails:

1. Stop v2 bot
2. Restore v1 database from backup
3. Deploy v1 image
4. Investigate v2 logs

Keep v1 running in parallel during migration if possible.

---

## Support

- Check `AGENTS.md` for current architecture docs
- Read `agents/architecture.md` for package map
- Read `agents/modules.md` for module details
- Read `agents/permissions.md` for permit system
