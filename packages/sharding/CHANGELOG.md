# @lumi/sharding

## 3.3.0

### Patch Changes

- 19dedd9: Fixes the dashboard RPC surface (moderation cases, warn thresholds, config overrides, blocklist, AFK/ignored-channel lists, module data, audit log, config history) that referenced `@lumi/contracts` types and repository methods that were never actually committed — the dashboard module failed to load at runtime (`Cannot read properties of undefined (reading 'map')`) because `WARN_THRESHOLD_ACTIONS` and related payload types didn't exist on this branch. Also completes the `@lumi/sharding` cluster-telemetry exports (`DEFAULT_CLUSTER_NAME`, `readClusterShards`) the RPC layer depends on for the shard-status panel.

## 3.2.0

## 3.1.1

### Patch Changes

- 3a37474: No functional change - trims verbose explanatory comments down to what the code's names and structure already convey.

## 3.1.0

### Patch Changes

- 82137ab: Relicense the core bot library and infrastructure packages from AGPL-3.0-only to GPL-3.0-only; first-party addons in lumi-addons remain AGPL-3.0-only. GPLv3 §13 / AGPLv3 §13 explicitly permit combining GPL and AGPL-licensed works, so third-party addons can keep depending on and importing the core SDK surface across the license boundary.
- 626d6ee: Fix a stale-read window in `RedisSessionStore`: `retrieve()` could read Redis directly while a `flush()` for the same shard was still mid-flight, returning stale or absent data instead of the value already snapshotted for write. Concurrent `flush()` calls are also now serialized instead of racing overlapping snapshots.

## 3.0.0

### Major Changes

- 70337e8: Remove the split gateway/worker topology; the worker now owns its own Discord
  Gateway connection.

  `apps/gateway` relayed raw Discord dispatch packets to workers over Redis
  Streams, and the worker replayed them into discord.js's internal
  `client.ws.handlePacket()`. That method assumes single-process invariants, which
  the relay could not satisfy: interaction pre-acknowledgement state was lost,
  `client.application` was unset when Sapphire registered slash commands, and two
  WebSocket sessions competed for one bot token.

  **Breaking changes:**

  - `apps/gateway` is deleted. Remove any `LUMI_ROLE=gateway` process from your
    deployment; the worker replaces it entirely.
  - `LUMI_ROLE` accepts only `worker` (default) and `scheduler`. The `monolith`
    and `gateway` roles are gone - `monolith` is now simply `worker`.
  - `RawGatewayPublisher`, `RawGatewayConsumer`, and the `RawGatewayEnvelope` /
    `rawGatewayStream` contracts are removed from `@lumi/event-bus` and
    `@lumi/contracts`.
  - `INTERACTION_DEFER_AT_GATEWAY` is removed; interactions are always deferred
    in-process.
  - Kubernetes: `gateway-statefulset.yaml` and `worker-scaledobject.yaml` are
    removed, and the worker deployment becomes a StatefulSet - it now holds real
    per-shard state, so replica count is a shard-assignment decision rather than a
    queue-lag autoscaler target.

  `@lumi/sharding` is now wired into the worker: with `CLUSTER_NAME` set, replicas
  divide the shard count from `GET /gateway/bot` between themselves, throttle
  IDENTIFY through Redis, and resume persisted sessions across restarts. Command
  registration against Discord's REST routes is gated behind a Redis leader lock
  so only one replica performs it per boot. Multi-replica deployments should set
  `DISCORD_PROXY_URL` to a shared `nirn-proxy` so REST rate-limit buckets stay
  coordinated. The task queue, scheduler RPC, and dashboard RabbitMQ RPC paths are
  unchanged.

### Patch Changes

- 5d96c1b: Bug-fix batch from an architecture review: symlink install no longer crashes on a dangling target; `ping`/`telemetryStats` clean up their intervals and REST listeners on unload; `InvalidationBus` now does a full resync when its Redis subscriber reconnects after a dropped connection, and `ModuleStore`/`TempVcRegistry` consume it; cache invalidation gets a delayed double-delete to close the stale-write race; sharding's `reconcileAssignment` re-reads the assignment after acquiring the leader lock to close a split-brain window; `ClusterReadyTracker` is now per-replica instead of a single global key; `RedisSessionStore.flush()` restores unflushed entries on a failed pipeline instead of losing them; `RedisIdentifyThrottler` no longer sleeps 250ms when a bucket lock is already free; dashboard RPC mutation handlers re-validate the actor's live Discord permissions instead of trusting the (up to 8h stale) session; the RabbitMQ RPC bridge nacks malformed messages and always replies on handler failure instead of leaving the dashboard caller to time out, and the dashboard RPC client no longer leaks its timer/listener on a synchronous send failure; `RedisStreamsBus` still acks a poison message if publishing it to the DLQ fails, instead of retrying it forever; `GuildWriteTransaction`'s `Symbol.dispose` logs release failures instead of swallowing them; `SecurityService`'s anti-nuke/raid rate limiters increment and set their TTL atomically, and `grantVerified` swaps roles in one call instead of leaving a member stuck with both roles if the second call fails.

## 1.0.1

### Patch Changes

- 40741cc: Add project hygiene, Changesets release automation, pre-commit hooks, and documentation fact-checking across workspace packages.
