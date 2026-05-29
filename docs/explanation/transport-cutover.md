# Event-bus transport cutover: Redis Streams → NATS JetStream

> Phase S8 slice 1. **You do not need NATS to run Ember.** Redis Streams is the
> default scale transport and stays correct up to the point Redis itself
> becomes the bottleneck — at which point this doc describes the cutover.

## Why two transports

`@ember/event-bus` exposes one `EventBus` interface; the env-driven `TRANSPORT`
selector picks an implementation. The semantic contract is the same across
all three:

| Transport | When to use | Delivery | Backpressure |
| --- | --- | --- | --- |
| `inproc` | single-process monolith, tests | in-memory EventEmitter, ack is a no-op | none |
| `streams` | gateway/worker split, ≤ ~20k evt/s sustained | Redis Streams, consumer groups, XAUTOCLAIM redelivery, DLQ | `MAXLEN ~` |
| `nats` | high event-rate cutover | JetStream stream + durable consumers, AckExplicit redelivery, DLQ | `max_msgs` |

Handlers don't know which transport is active. The same `BusMessage<T>` shape,
the same at-least-once + idempotent-handler contract, the same `deliveryCount`
on redeliver.

## When to cut over

Redis is single-threaded for command processing. At very high event rates the
Redis process pegs one CPU and XADD/XREADGROUP latency climbs — even though
Redis itself isn't out of memory or socket budget. Indicators:

- `ember_stream_consumer_lag` climbs faster than workers can drain it during
  steady state (not just bursts).
- Redis `INFO`'s `instantaneous_ops_per_sec` plateaus near the per-core ceiling
  (~50–80k ops/s on a modern x86) and CPU on the Redis container sits at
  ~100% of one core.
- p99 publish→ack latency on the gateway crosses ~50ms with Redis as the only
  hot dep.

**Empirical threshold:** ≈ 20k gateway events/s sustained. Below that, Redis
Streams is simpler operationally and the right choice. Above it, JetStream's
multi-server clustering removes the single-CPU ceiling.

## Cutover procedure (single host, docker-compose)

1. `docker compose --profile scale-nats up nats` — start the NATS server with
   JetStream enabled. The stream `EMBER_EVENTS` and per-group consumers are
   created lazily on first publish.
2. Drain the existing Streams workers: set `TRANSPORT=nats` + `NATS_URL=nats://nats:4222`
   on a **new** worker replica; let it consume nothing yet (no gateway is
   publishing to NATS, so its consume loop just idles).
3. Flip the gateway: redeploy `gateway` with `TRANSPORT=nats`. Old workers
   stop receiving traffic; the new NATS-aware worker drains the JetStream
   subjects.
4. Scale the old Streams workers to zero once Redis pending count is 0 for
   the relevant streams.

The Redis Streams data (XADD entries) is **not** migrated. JetStream starts
empty; the gateway publishes new traffic onto it. In-flight Redis entries
finish through their existing workers; the cutover is "stop publishing to A,
start publishing to B," not "transfer state from A to B."

## Cutover procedure (k8s)

Identical shape:

1. Deploy NATS (JetStream cluster — 3 replicas with PVCs is the documented
   reference; a single replica is fine for testing).
2. Set `TRANSPORT=nats` + `NATS_URL` on the worker Deployment; bump replicas
   one at a time.
3. Set the same on the gateway StatefulSet; rolling update.
4. Decommission `worker-streams` once consumer lag on the Streams group is 0.

The KEDA `ScaledObject` watches `ember_stream_consumer_lag` and
`ember_dlq_length`, both of which are emitted by `NatsJetStreamBus` via the
same `StreamStats` callback the Streams transport uses. The autoscaler keeps
working unchanged after the cutover.

## What stays on Redis

Redis Streams is the *event-bus* transport. Other Redis usage stays:

- Cache (`getOrSet`, `InvalidationBus`) — the bot's source-of-truth for
  derived state, not events.
- BullMQ (scheduled tasks, Redis DB 1).
- Cluster coordinator (`ZADD` member registry, `SET NX` leader lock,
  `Redis pub/sub` rebalance notifications).
- Per-shard session store, IDENTIFY throttler.
- Redis-based locks (`acquireRedisLock`, scheduler leader lock).

None of these move to NATS — they're correct on Redis and don't share the
single-CPU bottleneck the event bus hits.

## What stays on RabbitMQ

The dashboard RPC bridge (`ember.rpc.requests`) keeps using RabbitMQ. It's
request/response, not event fan-out; the throughput cap that motivates NATS
doesn't apply.

## Operational notes

- **JetStream stream name**: `EMBER_EVENTS`, subjects `ember.>`. The bus
  translates `:` → `.` at the boundary (`ember:gw:message_create` →
  `ember.gw.message_create`).
- **Durable consumer naming**: `<group>__<subject_with_underscores>`. A
  consumer-group rename requires deleting the old durable from the JetStream
  manager.
- **DLQ**: per-subject `<subject>.dlq`. Same body + provenance headers as the
  Streams transport's `<stream>:dlq`. Inspect with `nats stream view`.
- **ackWait**: tracks `EVENT_STREAM_CLAIM_MIN_IDLE_MS` (default 60s). Set it
  above your slowest legitimate handler.
- **Sequencing**: JetStream's per-subject sequence numbers are exposed as
  `BusMessage.id`. They're not directly comparable to Redis stream ids; if
  you persist ids, treat them as opaque per-transport.
