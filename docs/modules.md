# Modules & Features

Lumi ships 9 built-in feature modules in `packages/core/src/modules/`. Each is strictly isolated and toggled per-guild at runtime via `@DefineModule`.

| Module | Name | Commands | What it does |
| :---: | :--- | :--- | :--- |
| ⚙️ `core` | Core Infrastructure | `/lumi`, `/module`, `/help`, `/about`, `/ping`, `/repo`, `/dashboard`, `/download`, `/permit` | System infrastructure, module toggles, interactive config panels, repo links, addon downloader, and permit-node grant/revoke/list management |
| 🔨 `mod` | Moderation | `/ban`, `/softban`, `/unban`, `/kick`, `/timeout`, `/untimeout`, `/vcmute`, `/vcunmute`, `/quarantine`, `/unquarantine`, `/lockdown`, `/warn`, `/warnthresholds`, `/cases`, `/sanitize` | Moderation suite - case IDs, warning threshold escalation & decay, timed voice mutes (with disconnect), quarantine isolation, anti-raid lockdown, and username sanitization |
| 🛡️ `security` | Security Suite | `/panic`, `/verifypanel` | Wick-style protection: anti-nuke audit-log detector with auto-quarantine, join-gate raid detection with account-age gating, member verification, and panic-mode server lockdown with one-click revert. See [security.md](security.md). |
| 🚨 `filter` | Auto-Filter | `/lumi panel` | Real-time regex/substring message inspection (anti-spam, anti-invite, bad words) plus heat-based escalation that scores repeat offenses and auto-warns/times out/quarantines as heat climbs |
| 🔧 `utility` | Utilities | `/serverinfo`, `/whois`, `/avatar`, `/banner`, `/nick`, `/purge` | Guild info, user profiles, avatar/banner display, nickname management, bulk message purging |
| 💤 `afk` | AFK Manager | `/afk`, `/afkclean`, `/afklist`, `/afkstats` | Away status with custom reasons - notifies callers on mention, clears on return, admin management & stats |
| 🎙️ `tempvc` | Temp Voice | `/tempvc` | Auto-creates temporary voice channels on join, auto-deletes when empty |
| 📜 `logging` | Audit Logging | (event listener) | Logs message edits/deletes, member join/leave, role changes, mod actions |
| 🖥️ `dashboard` | Dashboard RPC | (internal) | Backend bridge between web admin panel (`apps/dashboard`) and worker guild state |

## Database Layers

`packages/core/src/lib/prisma/` and `packages/core/src/lib/database/` are not
duplicates - they cover different stores:

- **`lib/prisma/`** - `DatabaseService` and its `repositories/` wrap Postgres
  via Prisma. Every built-in module persists through a dedicated repository
  here (e.g. `SecurityRepository`, `PermissionRepository`, `TempVcRepository`).
  Access it via `container.db.<repository>`.
- **`lib/database/redis.ts`** - the Redis connection factory (including
  Sentinel HA support). Used directly for caches, rate-limit counters, and
  pub/sub, and indirectly by `@lumi/event-bus` for the Redis Streams event
  bus.

Third-party addons should use the generic `ModuleData` KV table (via
`container.db.guildKV`) instead of adding Prisma models - see
[GUIDE_MODULE_CREATION.md](GUIDE_MODULE_CREATION.md).

## Observability

- **Prometheus**: `:9090/metrics` - shards, command counters, queue latency, DB durations, heap stats
- **Grafana**: `:3001` (profile `observability`) - pre-configured dashboards, `admin`/`admin`
- **OpenTelemetry**: set `OTEL_ENABLED=true` → exports OTLP traces to `:4318` (viewable in Grafana Tempo)

## Developer CLI

```bash
bun run db:generate       # Generate Prisma client types
bun run db:seed           # Seed local development database with sample entities
bun run modules:manifest  # Compile module metadata manifests
bun run typecheck         # Full workspace typecheck
bun run lint              # ESLint suite
bun run test              # Unit & integration tests
bun run test:e2e          # End-to-end tests
bun run verify:resilience # Resilience & chaos verification
bun run validate <path>   # Validate a third-party addon
```

> [!NOTE]
> In a Nix environment, prefix with `nix-shell -p bun nodejs --run "..."` or run inside `nix develop`.

## Third-Party Addons

> [!WARNING]
> Addons run **inside** the Bun process - no VM sandbox. They have full access to your database, Redis, and Discord credentials. Only install addons from sources you fully trust. Always validate first with `bun run validate <path>`.
