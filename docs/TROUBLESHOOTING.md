# Troubleshooting

Symptom-first index across the whole stack. If you're troubleshooting a single-instance self-hosted setup, also check [Self-Hosting § Troubleshooting](GUIDE_SELF_HOSTING.md#troubleshooting) for the short version of the boot-time issues below.

## Boot & connectivity

| Symptom | Likely cause |
| :--- | :--- |
| `worker` exits immediately on boot | Missing/invalid `BOT_TOKEN` or `CLIENT_ID` - check container logs, or re-run `bun run setup` to re-verify the token against Discord's API. |
| `worker` starts but no slash commands appear | First-ever global registration can take up to an hour to propagate; test in a guild-scoped context for faster iteration. Otherwise check logs for registration errors (see [Architecture § Command registration](architecture.md#command-registration)). |
| `worker` can't reach Postgres | `pgbouncer` and `postgres` both need `condition: service_healthy` before `worker` starts - `docker compose ps` should show both `healthy`, not just `running`. Confirm `POSTGRES_URL` points at `pgbouncer` (port 6432), not `postgres` directly. |
| Migrations fail or hang in a clustered deployment | Run the `migrate` Job to completion before rolling `worker`/`scheduler` (`kubectl wait --for=condition=complete job/migrate`) - never let scaled workers race the same DDL. See [Production Deployment § Zero-downtime deploys](GUIDE_PRODUCTION_DEPLOYMENT.md#zero-downtime-deploys). |

## Dashboard

| Symptom | Likely cause |
| :--- | :--- |
| OAuth2 login fails / redirect loop | The callback URL isn't registered on the Discord application. NextAuth derives it from the request - there is no redirect-URI env var - so the value to register under **OAuth2 → Redirects** is `https://<your-dashboard-origin>/api/auth/callback/discord`, matching scheme, host, and port exactly. |
| Dashboard loads but every guild-scoped page 404s or redirects | Dashboard RPC couldn't reach `worker`'s internal HTTP RPC server, or the `dashboard` module is disabled for that guild - the RPC surface is what's disabled, not the web app itself (see [FAQ](FAQ.md#is-the-web-dashboard-required)). Confirm `RPC_HTTP_URL` is reachable from `apps/dashboard` and that `worker` is listening on `RPC_HTTP_PORT`. |
| Every dashboard action fails with `Unauthorized` | The dashboard's `RPC_INTERNAL_TOKEN` doesn't match the worker's (or is unset on one side), so the worker rejects the call with 401 before it reaches a handler. Set the same value in both services' environments and restart. |
| Worker exits at startup with `[ENV] Missing: RPC_INTERNAL_TOKEN` | Expected under `NODE_ENV=production`: the internal RPC server refuses to run unauthenticated. Generate a token with `openssl rand -hex 32` and set it on the worker and the dashboard. |
| Cookies not persisting behind a reverse proxy / HTTPS | There is no secure-cookie env var - NextAuth picks the `__Secure-` cookie prefix from the resolved URL scheme. If the proxy terminates TLS and forwards plain HTTP, the app resolves an `http://` origin and the prefixes disagree with the browser's expectation. Set `AUTH_URL` to the externally visible `https://` origin; `trustHost: true` is already set in `apps/dashboard/src/lib/auth.ts`, so forwarded Host headers are honoured. |

## Sharding & clustering

| Symptom | Likely cause |
| :--- | :--- |
| Boot refuses to proceed, citing session-start budget | Discord's remaining IDENTIFY budget can't cover the shards this replica is about to bring up - almost always the symptom of a crash-loop burning the daily allowance. Fix the underlying crash first; only set `SHARD_IDENTIFY_FORCE=true` to deliberately break the loop, and turn it back off immediately after. See [Architecture § Sharding & clustering](architecture.md#sharding--clustering). |
| Multiple `worker` replicas all try to register the same commands | Expected, and harmless - every replica registers its command set directly on boot regardless of `CLUSTER_NAME`, and Discord's bulk-overwrite endpoint is idempotent, so the redundant registrations are a no-op race, not a correctness issue. |
| Discord REST 429s increase after scaling past one replica | You likely need `nirn-proxy` deployed and `DISCORD_PROXY_URL` set so replicas share rate-limit buckets - required once more than one `worker` shares a bot token. See [Production Deployment § Clustering & sharding](GUIDE_PRODUCTION_DEPLOYMENT.md#clustering--sharding). |
| Total shard count change doesn't take effect | discord.js caches `shardCount` at `WebSocketManager` construction - changing `TOTAL_SHARDS` always requires a full restart. Shard assignment changes (`SHARD_LIST`) also require restarting the affected replicas - there is no in-place rebalance path. |

## Addons & modules

| Symptom | Likely cause |
| :--- | :--- |
| `,repo add` hangs or silently does nothing | The confirmation prompt times out after 30 seconds with no response, which cancels the add - nothing gets cloned. Respond to the prompt, don't just wait it out. |
| Addon fails to load / commands missing | Run `bun run validate <addon-path>` - it applies the same structural checks the downloader does (`info.json`/`index.ts` shape, the `scheduled-tasks/` naming trap, forbidden cross-module imports, raw `EmbedBuilder` usage). See [Quick Start: Your First Addon § 4. Iterate](QUICK_START_ADDON.md#4-iterate). |
| Addon's scheduled task never fires | Its BullMQ pieces almost certainly live in a folder named `tasks/` instead of exactly `scheduled-tasks/` - the wrong name is silently ignored, not an error. See [API Reference § `lumi/scheduling`](API_REFERENCE.md#lumischeduling). |
| Addon typecheck/lint fails referencing internal paths | Addon code must import only from `"lumi"` and its subpaths, never `#core/*`/`#lib/*`/`#utilities/*`/`#database/*` - those are internal implementation details. See [API Reference](API_REFERENCE.md). |
| Config field doesn't show up in `/config` or the dashboard | Confirm it's declared in the module's `configSchema` (via `cfg.*` builders) - fields aren't picked up any other way. See [API Reference § `cfg`](API_REFERENCE.md#cfg). |

## Observability

| Symptom | Likely cause |
| :--- | :--- |
| No traces showing up anywhere | `OTEL_ENABLED` defaults `false` - tracing is a no-op until you set it `true` and point `OTEL_EXPORTER_OTLP_ENDPOINT` at a reachable collector. |
| `/metrics` returns nothing or 404s | `METRICS_ENABLED` defaults `true`, but confirm `METRICS_PORT` (default `9090`) is actually exposed/scraped, and that you're hitting the right process - each app (`worker`, `scheduler`, `dashboard`) exposes its own. |
| Gateway heartbeats dropping under load | Watch `lumi_event_loop_delay_seconds`, specifically the **max** quantile, not p50/p99 - a single multi-second event-loop stall drops heartbeats regardless of what the median looks like. See [Architecture § Observability](architecture.md#observability). |

## Still stuck?

Open a discussion or issue on the [GitHub repo](https://github.com/lumi-devs/Lumi). Include your `LUMI_ROLE`, whether `CLUSTER_NAME` is set, and the relevant log lines - most reports without those take an extra round-trip to diagnose.
