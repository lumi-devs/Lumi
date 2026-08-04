# @lumi/contracts

## 3.1.1

### Patch Changes

- 3a37474: No functional change - trims verbose explanatory comments down to what the code's names and structure already convey.

## 3.1.0

### Patch Changes

- 82137ab: Relicense the core bot library and infrastructure packages from AGPL-3.0-only to GPL-3.0-only; first-party addons in lumi-addons remain AGPL-3.0-only. GPLv3 §13 / AGPLv3 §13 explicitly permit combining GPL and AGPL-licensed works, so third-party addons can keep depending on and importing the core SDK surface across the license boundary.
- f9e6d62: Replace `BusEventEnvelope<T>` (which wrongly implied a nested `{ payload: T }` wire shape) with a generic `BusEventMessage<T>` that reflects the actual flat envelope `RabbitClient#publishEvent` puts on the wire, so consumers get correctly typed fields instead of reaching for a `.payload` that doesn't exist.

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

### Minor Changes

- 27d4684: Group config fields into navigable subsections in the `/lumi` config panel.
  Modules with many settings (security, filter, logging) no longer render as a
  flat, multi-page scroll of every field; a `group` on each config field collects
  related settings into a section, and the detail view shows one section at a time
  with a "jump to section" select. Small modules are unchanged. Large ungrouped
  modules fall back to automatic paging so the component budget is never exceeded.

## 1.0.1

### Patch Changes

- 40741cc: Add project hygiene, Changesets release automation, pre-commit hooks, and documentation fact-checking across workspace packages.
