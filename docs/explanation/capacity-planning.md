# Capacity planning: guilds → shards → replicas → memory

Part II Phase **S3 slice 4** — the math operators use to size a cluster.
Values are conservative defaults from production discord.js v15 deployments;
override with measurements from your own Grafana once you have them
(`ember_guild_count`, RSS per replica, `ember_stream_consumer_lag`).

## 1. Guilds → shards

Discord allows ~2,500 guilds per shard. We over-provision by 20% so the bot
can absorb a burst of joins without re-sharding (a re-shard requires every
shard to re-IDENTIFY, which is expensive — see §5):

```
shards = ceil(guilds / 2000)
```

| Guilds      | Shards (recommended) |
| ----------- | -------------------- |
| ≤ 2,000     | 1                    |
| 10,000      | 5                    |
| 50,000      | 25                   |
| 150,000     | 75                   |
| 500,000     | 250                  |

`GET /gateway/bot` returns Discord's *recommendation* (`info.shards`) and is
the authoritative value — `@ember/sharding` reads it on every boot and logs
it. Pin `TOTAL_SHARDS` only when you've explicitly capped capacity for cost
reasons.

## 2. Shards → gateway replicas

A single gateway replica can comfortably maintain ~32 shard WS connections
before event-loop lag from RAW dispatch parsing starts to show up in p99.
Past that, split:

```
gatewayReplicas = ceil(shards / 32)
```

Higher densities are technically possible (the WS connections are cheap)
but the moment a single replica's RAW-dispatch parsing falls behind, *all*
its shards' events lag — keep the per-replica shard count low enough that
node never blocks for more than 50ms on a single tick.

| Shards | Gateway replicas | Shards/replica |
| ------ | ---------------- | -------------- |
| 1      | 1                | 1              |
| 25     | 1                | 25             |
| 75     | 3                | 25             |
| 250    | 8                | ~31            |
| 1000   | 32               | ~31            |

The cluster coordinator (S3.2) divides shards into contiguous chunks across
replicas — see `assignShards()` in `packages/sharding/src/coordinator.ts`.

## 3. Memory budget per replica

discord.js cache + node baseline + observability:

| Component                                | RSS  |
| ---------------------------------------- | ---- |
| Node + V8 baseline                       | 90  MB |
| @ember/observability + Sentry (idle)     | 60  MB |
| discord.js client w/ Ember `makeCache`   | 200 MB at 25 shards |
| Per-shard WS + decode buffers            | ~6  MB/shard |
| Guild cache @ Ember `makeCache` settings | ~25 KB/guild |

```
rss(replica) ≈ 350 MB + 6 MB × shards + 25 KB × guildsHosted
```

A 25-shard, 50k-guild replica budgets ~1.75 GB RSS; size the container at
2 GB with `--max-old-space-size=1536` for headroom against burst allocations.
Workers (no Discord cache) are smaller — budget ~600 MB.

## 4. Worker replicas (S2)

Workers consume the raw-gateway streams. KEDA scales them on consumer-group
lag (S7); the floor is set by request-side latency on the busiest event type
(usually `MESSAGE_CREATE`):

```
workerReplicas ≈ ceil(peakDispatchesPerSec / handlerThroughputPerSec)
```

For Ember today (mod actions, AFK, leveling, etc.) the typical throughput
is ~250 dispatches/sec per worker — three workers covers any non-launch
event spike for a 50k-guild bot.

## 5. IDENTIFY budget

`GET /gateway/bot.session_start_limit.total` is the daily IDENTIFY allowance
(`max=1000` for unverified bots, `2500/24h` for verified). A full re-IDENTIFY
of N shards consumes N slots; a session RESUME (S3.3) consumes 0.

Practical rules of thumb:

- A monolith restart with sessions ≤ 5 min old: **0 IDENTIFYs** (all RESUME).
- A cluster rebalance shifting K shards: **≤ K IDENTIFYs** (the shards that
  changed owner; unchanged shards stay connected).
- A re-shard (increase `TOTAL_SHARDS`): **shards IDENTIFYs** — plan downtime
  or rolling upgrade.

`@ember/sharding`'s `planShards` refuses to start when
`session_start_limit.remaining < shardsToIdentify`, so a crash loop cannot
burn the daily budget. Override with `SHARD_IDENTIFY_FORCE=true` only as
an emergency measure (you almost certainly want to wait for the bucket reset
instead).

## 6. Worked example — 50k guilds

```
guilds         = 50_000
shards         = ceil(50_000 / 2_000)            = 25
gatewayRepls   = ceil(25 / 32)                   = 1
workerRepls    = floor cap for handler latency   = 3
schedulerRepls = 1 (leader-elected, S5)          = 1
apiRepls       = 2 (HA, S6)                      = 2

rss(gw)     ≈ 350 + 6×25 + 0.025×50_000          = 1_750 MB
rss(worker) ≈ 350 + 0   + 0                      = 350-600 MB each
rss(sched)  ≈ 250 MB
rss(api)    ≈ 250 MB each
```

Total cluster RSS for the bot tier: ~3.5 GB. Postgres/Redis/RabbitMQ sit
alongside; size those by query/connection load rather than guild count.
