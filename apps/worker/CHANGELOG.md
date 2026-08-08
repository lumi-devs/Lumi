# @lumi/worker

## 3.3.0

### Patch Changes

- Updated dependencies [19dedd9]
- Updated dependencies [ef84827]
  - @lumi/core@3.3.0
  - @lumi/observability@3.3.0

## 3.2.0

### Patch Changes

- Updated dependencies [125dfa1]
- Updated dependencies [5079ab2]
  - @lumi/core@3.2.0
  - @lumi/observability@3.2.0

## 3.1.1

### Patch Changes

- Updated dependencies [3a37474]
  - @lumi/core@3.1.1
  - @lumi/observability@3.1.1

## 3.1.0

### Patch Changes

- 82137ab: Relicense the core bot library and infrastructure packages from AGPL-3.0-only to GPL-3.0-only; first-party addons in lumi-addons remain AGPL-3.0-only. GPLv3 §13 / AGPLv3 §13 explicitly permit combining GPL and AGPL-licensed works, so third-party addons can keep depending on and importing the core SDK surface across the license boundary.
- Updated dependencies [82137ab]
- Updated dependencies [653797b]
- Updated dependencies [4fbd1e6]
- Updated dependencies [e1f5c3b]
- Updated dependencies [25e9905]
- Updated dependencies [1157762]
- Updated dependencies [146c469]
- Updated dependencies [0dcc859]
- Updated dependencies [7562e46]
- Updated dependencies [45b9864]
- Updated dependencies [32d5e2c]
- Updated dependencies [b17febf]
- Updated dependencies [357d9f1]
  - @lumi/core@3.1.0
  - @lumi/observability@3.1.0

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

- Updated dependencies [496bd98]
- Updated dependencies [ee531ab]
- Updated dependencies [342061d]
- Updated dependencies [70337e8]
- Updated dependencies [c1c11a6]
- Updated dependencies [adfe8ac]
- Updated dependencies [4b2b884]
- Updated dependencies [b98e33f]
- Updated dependencies [1503ca0]
- Updated dependencies [455d5f8]
- Updated dependencies [5d96c1b]
- Updated dependencies [69b8295]
- Updated dependencies [27d4684]
- Updated dependencies [70337e8]
- Updated dependencies [c12e5f6]
- Updated dependencies [0d30456]
- Updated dependencies [70337e8]
- Updated dependencies [2aa3396]
  - @lumi/core@3.0.0
  - @lumi/observability@3.0.0

## 1.0.1

### Patch Changes

- 40741cc: Add project hygiene, Changesets release automation, pre-commit hooks, and documentation fact-checking across workspace packages.
- Updated dependencies [40741cc]
  - @lumi/core@1.0.1
  - @lumi/observability@1.0.1
