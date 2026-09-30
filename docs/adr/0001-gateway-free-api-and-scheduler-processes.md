# 0001: Gateway-free `api` and `scheduler` processes

Status: Accepted

## Context

Historically only `apps/worker` (a discord.js `ShardingManager` spawning
per-shard children) could answer a dashboard request or run a BullMQ job,
because it alone held a gateway connection and the `@sapphire/framework`
container built around it. That coupled dashboard latency and job throughput
to shard health. It was also never actually safe: `apps/worker` only caches
guilds the *specific shard* that owns them has seen, and an RPC handler or
scheduled job has no fixed shard to ask.

## Decision

Split the RPC surface and the job scheduler into their own processes that
never call `.login()`:

- `apps/api` boots a `SapphireClient` without logging in, registers
  `packages/core/src/lib/rpc/*` handlers, and owns its own HTTP transport
  (`apps/api/src/rpc-http-server.ts`, `startRpcHttpServer()`). No BullMQ.
- `apps/scheduler` boots the same way and owns BullMQ job processing,
  repeatable-job registration, and the cluster-wide scheduler lock
  (`bootstrapSchedulerApp()`, `apps/scheduler/src/main.ts`). No RPC serving.

With no gateway cache, guild/member/role reads that back RPC authorization go
through Discord's REST API (`packages/core/src/lib/rpc/discord-rest-lookup.ts`):
short-TTL Redis cache-aside for display data, deliberately *uncached* for
authorization decisions (`checkGuildManagerRest`) so a just-revoked
`ManageGuild` can't stay valid for a stale TTL.

## Consequences

Dashboard availability and job throughput no longer depend on shard health;
either process scales/restarts independently of `apps/worker`. The cost is
REST lookups instead of a free gateway cache hit, plus the small staleness
window non-authorization REST reads tolerate. `lumi start all`
(`apps/cli/src/commands/start.ts`) still runs all three as one supervised
unit for the single-process self-host case (ADR 0010).
