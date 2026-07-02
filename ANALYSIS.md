# ANALYSIS.md — Codebase Audit (2026-07-02)

Fresh audit replacing the old feature-roadmap version. Everything below was
verified against the code at commit `7afb203`, not assumed. Verification
baseline: `bun run typecheck` clean, 47/47 tests green, Prisma migrations
apply cleanly against the compose Postgres, all four compose profiles
(`default`, `scale`, `scale-nats`, `observability`) pass `docker compose config`.

## 1. What actually works (verified, not for show)

- **Monolith path** — `cp .env.example .env` (set `BOT_TOKEN`/`CLIENT_ID`) →
  `docker compose up` boots Postgres + PgBouncer + Redis + RabbitMQ + the bot
  in one process (`LUMI_ROLE=monolith`). Migrations run on container start.
  Verified up to the first Discord API call (needs a real token past that).
- **Role split (scale profile)** — all real, not scaffolding:
  - `apps/gateway`: thin `@discordjs/ws` loop, no discord.js Client; publishes
    raw dispatch packets to Redis Streams/NATS; clustered IDENTIFY throttling,
    session resumption, in-place shard rebalance, defer-at-gateway pre-acks.
  - `apps/worker`: full Sapphire client with `ws.connect` no-op'd; consumes raw
    packets via `RawGatewayConsumer`; pre-deferred-interaction patches prevent
    double-acks.
  - `apps/scheduler`: owns BullMQ; republishes task effects onto
    `lumi.scheduler.fire:<name>`; optional Redis leader lock for hot-standby.
  - Readiness probes (`/readyz`), graceful drain sequences, and per-role
    shutdown ordering are wired in all entrypoints.
- **Module update / restart flow** — end-to-end wired: `/module update` →
  `DownloaderService.updateModule` records the commit, then (default
  `MODULE_UPDATE_AUTO_RESTART=true`) offers a "Restart Now" button →
  `module-restart` handler → `scheduleProcessRestart` → SIGTERM → graceful
  drain → supervisor (`restart: unless-stopped` / k8s) brings it back with the
  new code. This is the Bun-correct answer (ESM can't purge module graphs; even
  Red-DiscordBot restarts for shared-lib changes). Legacy best-effort in-process
  reload remains behind `MODULE_UPDATE_AUTO_RESTART=false`.
- **Feature modules** — every command performs its real effect (spot-checked
  afk, filter, mod incl. `modLift` expiry task, tempvc, purge, nick,
  user_media). Scheduled tasks live in correctly-named `scheduled-tasks/` dirs
  and relay Discord side-effects through the fire bus so they run on roles with
  a client.
- **Deploy artifacts** — Dockerfile (prod + dev targets) is coherent; k8s
  manifests (KEDA-autoscaled worker, gateway StatefulSet, scheduler with leader
  lock, migrate Job, shared PVC) are consistent with the compose topology;
  chaos/verify scripts are real runners with exit-code contracts, run by CI.

## 2. For-show / dead / stub parts

| Part | State | Recommendation |
|---|---|---|
| `apps/api` | Stub: re-imports `@lumi/worker/main`, runs as a second worker. | Either build the real thin RPC-only entrypoint (Rabbit RPC consumer without module/event work) or drop the service from compose/k8s until it exists. |
| `RedisEntityCache` | Write path exists but is **off by default** (`ENTITY_CACHE_POPULATE`); accessors have zero read callers. Provisioned-ahead for a future `GuildManager: 0` step. | Keep (documented as such) or delete until the step lands. Harmless either way. |
| Dashboard | Bot-side RPC handlers are real; the web app (`../lumi-dashboard`) is a separate repo and its compose service is commented out. | Fine as-is; the RPC surface is only reachable when the dashboard repo is deployed. |
| Stale comments | compose header claims "gateway/scheduler/api currently boot the full worker" (only api does); `LumiClient` says "Streams mode … not yet driving dispatch" (RawGatewayConsumer does drive dispatch). | Fix comments. |

## 3. Real defects found

1. **Fresh-clone `docker compose up` hard-fails** — every service has
   `env_file: .env` (required), so without the `cp .env.example .env` step even
   `docker compose config` errors. Consider `env_file: [{path: .env, required: false}]`
   or a clearer error path; README does document the copy step.
2. **Bad/missing `BOT_TOKEN` produces a raw uncaught stack** — `planShards`
   (called from `LumiClient.bootstrap()` in monolith/gateway roles) runs
   *outside* the entrypoints' try/catch around `login()`, so a 401 dumps an
   unhandled `DiscordAPIError` instead of a clean fatal log.
3. **k8s README drift** — apply order references a nonexistent
   `gateway-service.yaml` (the Service is inline in `gateway-statefulset.yaml`),
   omits `migrate-job.yaml` and `lumi-data-pvc.yaml`, and uses invalid
   `kubectl apply -f a.yaml b.yaml` syntax (needs `-f` per file).

## 4. Feature gaps (carried over — still valid, but these are features, not flaws)

The old roadmap's gap list vs Skyra/YAGPDB remains directionally correct:
filter is terms-only (no rule engine / invite / mention-spam / regex rules),
mod lacks appeals/evidence/audit-log correlation, and there is no
logging/leveling/self-roles/reminders/starboard/giveaways/tags. Priority order
from before still holds: filter overhaul → mod depth → logging module →
tempvc controls → leveling → the rest.

## 5. Suggested fix order

1. Defect 2 (clean fatal on bad token) — smallest, biggest first-run UX win.
2. Defect 1 (optional env_file or better failure message).
3. Comment/docs drift (compose header, LumiClient comment, k8s README).
4. Decide `apps/api`: build the real split or remove the stub service.
5. Then feature work per §4.
