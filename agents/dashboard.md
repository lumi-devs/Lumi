# Web Dashboard Architecture

## Overview

The dashboard (`apps/dashboard/`) is a standalone SvelteKit application that runs
as a **separate process** from the bot. It serves the web UI for guild
configuration and communicates with the bot exclusively via the **internal RPC
control server**.

## Responsibilities

- Discord OAuth2 login flow
- Guild selector (guilds the user manages where the bot is present)
- Per-guild configuration panels:
  - Permits (create, edit, assign, explain)
  - Module enable/disable
  - Feature configs (moderation, security, economy, etc.)
  - Audit log / cases
  - Security settings (antinuke, automod, verification)
  - Stats & insights
- Web verification (emoji or button verification with role assignment)

## Non-Responsibilities

- **No Discord gateway connection** — the dashboard never connects to Discord
  WebSocket/gateway
- **No live state queries to PostgreSQL** — the database is only used for
  durable config the dashboard itself writes (OAuth sessions, audit entries,
  permits/assignments). Live state (guild cache, members, loaded modules,
  command registrations) comes from the bot via RPC.

## Communication: Bot RPC

All live data is fetched from the bot's internal HTTP server (`RPC_HTTP_HOST`,
`RPC_HTTP_PORT`, default `127.0.0.1:8091`).

### Authentication

`RPC_INTERNAL_TOKEN` (optional) is sent as `Authorization: Bearer <token>`.
When unset, endpoints are open (dev only).

### Endpoints Used

| Method | Path                               | Purpose                                        |
| ------ | ---------------------------------- | ---------------------------------------------- |
| `GET`  | `/healthz`                         | Health check (shows in dashboard footer)       |
| `GET`  | `/api/v1/status`                   | Bot tag, guild count, loaded modules list      |
| `GET`  | `/api/v1/permits/nodes?guild_id=X` | Dynamic permission node catalog                |
| `GET`  | `/api/v1/guilds/X`                 | Live guild info (name, icon, member count)     |
| `POST` | `/api/v1/guilds/X/modules/Y/state` | Apply module enable/disable to the running bot |

Module toggles persist to the database first, then push the new state to the bot
over RPC so commands and listeners react immediately without a restart. If the
bot is unreachable, the dashboard reports a warning and the change applies on the
next bot startup sync.

### Node Catalog (`/api/v1/permits/nodes`)

This is the key dynamic endpoint. The bot builds the catalog by combining:

1. **Built-in permit nodes** — from `@lumi/permits` constants (`*`, `admin.*`, etc.)
2. **Module command nodes** — every loaded module's commands with `requiredPermit`
   set; also adds namespace wildcards (`mod.*` for `mod.ban`)
3. **Custom permit nodes** — existing permits in DB for that guild (via
   `PermitRepository.listPermits`)

The dashboard renders this as a searchable multi-select. No hardcoded node lists
in dashboard code.

### Guild Info (`/api/v1/guilds/:id`)

Returns live guild data from the bot's `client.guilds.cache`:

- `id`, `name`, `icon` (hash), `memberCount`

Used for the guild selector and panel headers.

## Dashboard Data Flow Example: Permits Page

```
User visits /guilds/123/permits
    │
    ▼
+page.server.ts load()
    │
    ├─► Prisma: SELECT * FROM permit WHERE guild_id = 123 (existing permits)
    │
    └─► fetchPermitNodes("123")
            │
            ▼
    GET http://127.0.0.1:8091/api/v1/permits/nodes?guild_id=123
            │
            ▼
Bot: createPermitNodesHandler
    │
    ├─► BuiltinPermits.flatMap(p => p.nodes)  → ["*", "admin.*"]
    │
    ├─► moduleLoader.listAll().flatMap(m => m.definition.commands)
    │       .map(c => c.requiredPermit).filter(...)
    │       → ["mod.ban", "mod.kick", "economy.*", ...]
    │
    └─► permitRepo.listPermits("123").flatMap(p => p.nodes)
            → ["mod.note", "admin.config"]
            │
            ▼
    Merge, dedupe, sort → JSON { nodes: ["*", "admin.*", "mod.*", ...] }
            │
            ▼
Dashboard renders <select multiple> with all nodes
```

## Configuration

Environment variables in `apps/dashboard/.env`:

```env
# Required for Discord OAuth
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_OAUTH_REDIRECT_URI=http://localhost:4173/auth/callback

# Session
SESSION_SECRET=long-random-secret

# Database (same as bot)
DATABASE_URL=postgresql://lumi:lumi@127.0.0.1:5432/lumi
REDIS_URL=redis://localhost:6379/0

# Bot token — ONLY for role changes during web verification
BOT_TOKEN=

# Bot RPC — for ALL live data
RPC_URL=http://127.0.0.1:8091
RPC_INTERNAL_TOKEN=optional-shared-secret

# Bot owners allowed to manage add-ons and wildcard permits
OWNER_IDS=
```

## Security Model

- Dashboard authenticates users via Discord OAuth (guilds scope)
- User's accessible guilds = intersection of (user's managed guilds) ∩ (bot's guilds)
- All RPC calls include `RPC_INTERNAL_TOKEN` — only trusted dashboard instances can query
- Bot token is only used for role assignment in web verification; never exposed to dashboard frontend
- Add-on management requires `OWNER_IDS`; guild managers cannot install or update global code
- Creating, editing, assigning, or deleting a permit containing `*` requires
  `OWNER_IDS`; guild `Extra Owner` holders cannot mint another wildcard permit

## Adding New Live Data Endpoints

1. Add handler in `src/core/rpcRoutes.ts` (`createXxxHandler`)
2. Wire it in `src/index.ts` RPC handler
3. Add client function in `apps/dashboard/src/lib/server/rpc.ts`
4. Call from dashboard `+page.server.ts` load function

Never add Prisma queries in dashboard for data the bot owns live.
