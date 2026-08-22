---
title: "Production Deployment Guide"
description: "Hardening and scaling beyond self-hosting: clustering, secrets, monitoring, zero-downtime deploys."
---

Hardening and scaling guidance beyond [Self-Hosting](/Lumi/guides/self-hosting/), for running Lumi as more than a single always-on process for a handful of guilds. This page assumes you've already read [Architecture & System Topology](/Lumi/architecture/) - it explains *why* each piece below exists; this page is about operating it.

For the full Kubernetes manifest reference and step-by-step `kubectl` commands, see [`deploy/k8s/README.md`](https://github.com/lumi-devs/Lumi/blob/main/deploy/k8s/README.md). This guide covers the decisions around those manifests, not a restatement of them.

## Do you actually need to scale past one replica?

A single `worker` replica handles every shard Discord assigns it (`TOTAL_SHARDS=auto`) and every guild on those shards, in one process. That's sufficient until either:

- Discord's recommended shard count grows past what one process can hold in memory/CPU (guild count is the usual trigger, roughly the 2,500-guild-per-shard heuristic Discord itself uses), or
- you want zero-downtime deploys / redundancy against a single process crash.

If neither applies yet, stay on the single-replica path from [Self-Hosting](/Lumi/guides/self-hosting/) - `CLUSTER_NAME` unset, no `nirn-proxy`. Everything below only activates once you set `CLUSTER_NAME`.

## Clustering & sharding

Scaling past one replica is static: each replica is told which shard IDs it owns via `SHARD_LIST`, there is no runtime coordination between replicas, and `CLUSTER_NAME` only namespaces the shard telemetry each replica publishes for the dashboard's fleet view (see [Architecture § Sharding & clustering](/Lumi/architecture/#sharding--clustering)). Practical knobs:

| Decision | Guidance |
| :--- | :--- |
| **Shards per replica** | Start at 16-32. Fewer shards per replica means faster individual pod restarts but more replicas to manage. |
| **`TOTAL_SHARDS`** | Leave `auto` unless you have a specific reason to pin it - Discord's recommendation already accounts for your guild count. Pinning it wrong causes either wasted capacity or an under-sharded bot that gets rate-limited. |
| **`SHARD_IDENTIFY_FORCE`** | Leave `false`. This exists to break a crash-loop deliberately; leaving it on defeats the session-start budget guard that stops a crash-loop from burning your daily IDENTIFY allowance and getting the bot rate-limited by Discord. |
| **`nirn-proxy`** | Required once you run more than one worker replica sharing the same bot token - it coordinates Discord REST rate-limit buckets across pods. Deploy it before your first multi-replica worker rollout (workers read `DISCORD_PROXY_URL` at boot). |

Scaling replicas, or changing which shard IDs a replica owns, means changing `SHARD_LIST` and `TOTAL_SHARDS` and restarting the affected processes - there is no in-place rebalance path. Total shard count changes always require a full restart: discord.js caches `shardCount` at `WebSocketManager` construction, so a running process can't adopt a new total without restarting.

## Secrets management

`deploy/k8s/secret.example.yaml` is a template, not something to fill in and commit. In order of preference for production:

1. **A secrets manager with a Kubernetes-native sync** (e.g. External Secrets Operator against AWS Secrets Manager / GCP Secret Manager / Vault) - secrets never touch `kubectl apply` or your git history at all.
2. **[Sealed Secrets](https://github.com/bitnami-labs/sealed-secrets)** - encrypt the `Secret` manifest with the cluster's public key, safe to commit the sealed version; only the cluster's controller can decrypt it.
3. **A plain `Secret` manifest applied out-of-band** - acceptable for a small deployment, but never commit the filled-in file (`secret.yaml` is the convention `deploy/k8s/README.md` uses - keep it out of git, e.g. via `.gitignore` or a separate private repo/vault for ops manifests).

Rotate `BOT_TOKEN` via the Developer Portal's **Reset Token**, `DASHBOARD_SESSION_SECRET` via `openssl rand -hex 32`, and database/broker passwords through your infrastructure's normal credential rotation - all three just need the corresponding `Secret` updated and the affected pods restarted (`kubectl rollout restart`).

## Monitoring & observability

[`packages/observability`](https://github.com/lumi-devs/Lumi/blob/main/packages/observability/README.md) wires up the full stack identically across every app - nothing extra to instrument per-module. In production:

- **Set `OTEL_ENABLED=true`** and point `OTEL_EXPORTER_OTLP_ENDPOINT` at your collector. Lower `OTEL_TRACES_SAMPLE_RATIO` (e.g. `0.1`) once trace volume matters - `1` (100%) is fine for a single low-traffic instance, not for a sharded fleet.
- **Scrape `/metrics`** (`METRICS_PORT`, default `9090`) on every pod - the k8s manifests already annotate for Prometheus Operator discovery. Dashboard-worthy signals from [Architecture § Observability](/Lumi/architecture/#observability): command RED metrics, event-bus lag (`lumi_stream_consumer_lag`) and DLQ depth (`lumi_stream_dlq_length`), gateway shard latency/status, Discord REST 429 rate, Postgres pool utilization, event-loop delay p99/max.
- **Alert on `lumi_event_loop_delay_seconds` (max quantile), not just p50/p99** - a single multi-second stall drops Discord gateway heartbeats regardless of what the median looks like. This is the single most important gateway-health signal to page on.
- **Wire `/healthz` and `/readyz`** into your orchestrator's liveness/readiness probes (already done in the k8s manifests) - only the primary shard in each pod binds them (see [Architecture § Primary shard](/Lumi/architecture/#primary-shard)). `/readyz` runs every registered probe (Postgres, Redis, gateway readiness aggregated across every shard in the pod, plus BullMQ reachability) with a 2s timeout each - a pod that can't reach a dependency gets pulled from rotation automatically.
- The bundled `docker compose --profile observability` stack (otel-collector, Tempo, Prometheus, Grafana) is a reasonable starting point for self-managed monitoring, but isn't itself HA - point at a managed/clustered equivalent (Grafana Cloud, a real Prometheus HA pair, etc.) once uptime of the monitoring stack itself matters.

## Zero-downtime deploys

The pieces that make a rolling deploy safe are already built in - this section is about not defeating them:

- **`markDraining()` on SIGTERM** flips `/readyz` to 503 *immediately*, before in-flight work finishes, so the orchestrator stops routing new traffic while existing work drains. Don't set `terminationGracePeriodSeconds` so low that in-flight command executions or event-bus acks get killed before they finish - the k8s manifest's `preStop` sleep (15s) exists to give the orchestrator's own routing update time to propagate before the process actually starts shutting down.
- **`worker` is a `StatefulSet` with `maxUnavailable: 1`** - shard identity (WebSocket session, sequence number) is per-pod state, so replacing more than one at a time risks multiple shard ranges going dark simultaneously. Don't override this to speed up rollouts.
- **Session persistence in Redis** means a replaced pod RESUMEs its predecessor's shard sessions instead of spending fresh IDENTIFY calls - this is what makes rolling restarts cheap against Discord's session-start budget. It depends on Redis being reachable and `CLUSTER_NAME` set; without clustering, a restart always pays for fresh IDENTIFYs.
- **Run the `migrate` Job to completion before rolling `worker`** (`kubectl wait --for=condition=complete job/migrate`) - never let a new schema and old application code (or vice versa) run concurrently longer than the migration itself takes. Design migrations to be backward-compatible for at least one deploy cycle if you need the old and new code to coexist during a rollout (additive column first, backfill, only then a follow-up deploy that starts requiring it).

## Resource sizing

The Compose services define baseline limits (`worker`: 512MB/1 CPU, `postgres`: 256MB, `redis`: 160MB) - treat these as a floor for testing, not a production sizing recommendation. Actual `worker` memory scales with guild/member cache size (shards-per-replica × average guild size), and `NODE_OPTIONS=--max-old-space-size` should be set explicitly rather than left to V8's default heuristic, which over-commits on container cgroup limits it can't see correctly on some runtimes. Watch `lumi_pg_pool_used`/`lumi_pg_pool_waiting` (Postgres pool exhaustion under load is a common bottleneck before CPU is) and size `POSTGRES_POOL_MAX` / `pgbouncer`'s `DEFAULT_POOL_SIZE` together - `pgbouncer` in `transaction` pool mode lets many more logical worker connections share fewer real Postgres backends than `POSTGRES_POOL_MAX` alone would suggest.

## Checklist before going to production

- [ ] Secrets sourced from a manager/Sealed Secrets, not a plain committed manifest.
- [ ] `OTEL_ENABLED=true`, trace sample ratio tuned for your traffic volume.
- [ ] Alerting wired to `/readyz` failures and `lumi_event_loop_delay_seconds` (max).
- [ ] `CLUSTER_NAME` set and `nirn-proxy` deployed *before* scaling `worker` past 1 replica.
- [ ] `GRAFANA_PASSWORD` changed from the default if the observability stack is exposed at all.
- [ ] Postgres backups automated (see [Self-Hosting § Backups](/Lumi/guides/self-hosting/#backups)) and periodically restore-tested.
- [ ] Dashboard served over HTTPS, with `AUTH_URL` set to its externally visible origin if a proxy rewrites the Host header - that's what makes NextAuth issue `__Secure-` cookies. There is no secure-cookie env var.
- [ ] A runbook for `BOT_TOKEN` rotation that doesn't require a full redeploy (just the `Secret` + a rollout restart).

