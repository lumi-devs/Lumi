# Modules & Features

Lumi ships 8 built-in modules in `packages/core/src/modules/`. Each is strictly isolated and toggled per-guild at runtime via `@DefineModule`.

| Module | Name | Commands | What it does |
| :---: | :--- | :--- | :--- |
| ⚙️ `core` | Core Infrastructure | `/lumi`, `/module`, `/permissions`, `/prefix` | Built-in system infrastructure, module toggles, prefix settings, Wick permit assignments |
| 🔨 `mod` | Moderation | `/ban`, `/kick`, `/timeout`, `/warn`, `/quarantine`, `/lockdown`, `/dehoist` | Full mod suite — case IDs, warning threshold escalation & decay, timed voice mutes (with disconnect), channel restrictions, anti-raid lockdown & dehoisting |
| 🛡️ `filter` | Auto-Filter | `/lumi panel` | Real-time regex/substring message inspection — anti-spam, anti-invite, bad words |
| 🔧 `utility` | Utilities | `/serverinfo`, `/whois` | Server info, user profiles, avatar lookup, guild diagnostics |
| 💤 `afk` | AFK Manager | `/afk` | Away status with reasons — notifies callers on mention, clears on return |
| 🎙️ `tempvc` | Temp Voice | `/tempvc` | Auto-creates temporary voice channels on join, auto-deletes when empty |
| 📜 `logging` | Audit Logging | (event listener) | Logs message edits/deletes, member join/leave, role changes, mod actions |
| 🖥️ `dashboard` | Dashboard RPC | (internal) | Backend bridge between web admin panel and worker guild state |

## Observability

- **Prometheus**: `:9090/metrics` — shards, command counters, queue latency, DB durations, heap stats
- **Grafana**: `:3001` (profile `observability`) — pre-configured dashboards, `admin`/`admin`
- **OpenTelemetry**: set `OTEL_ENABLED=true` → exports OTLP traces to `:4318` (viewable in Grafana Tempo)

## Developer CLI

```bash
bun run db:generate       # Generate Prisma client types
bun run modules:manifest  # Compile module metadata manifests
bun run typecheck         # Full workspace typecheck
bun run lint              # ESLint suite
bun run test              # Unit & integration tests
bun run test:e2e          # End-to-end tests
bun run verify:resilience # Resilience & chaos verification
bun run validate <path>   # Validate a third-party addon
```

> [!NOTE]
> In a Nix environment, prefix with `nix-shell -p bun nodejs --run "..."`.

## Third-Party Addons

> [!WARNING]
> Addons run **inside** the Bun process — no VM sandbox. They have full access to your database, Redis, and Discord credentials. Only install addons from sources you fully trust. Always validate first with `bun run validate <path>`.
