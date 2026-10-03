# 0002: Typed HTTP RPC over a contracts router, not tRPC/gRPC

Status: Accepted

## Context

The dashboard and `apps/api`/`apps/worker` are independently deployed (ADR
0003) and must never share a database or Redis connection, so every
dashboard read/write crosses a process boundary that needs to be typed
end-to-end and to fail loudly when the two sides drift, since they ship on
independent cadences. gRPC would add a protobuf toolchain neither side
otherwise needs; tRPC ties the client to a specific server framework version
and colocation, which conflicts with the dashboard living in its own repo.

## Decision

A plain typed router: per-module contract slices under
`packages/contracts/src/rpc/*.ts` (`afk.ts`, `mod.ts`, `dashboard.ts`, ...),
assembled by `packages/contracts/src/rpc/router.ts` into `rpcRouter` /
`RpcActionName` — no hand-written action-to-payload map. The wire format is
JSON over HTTP, served by `apps/api/src/rpc-http-server.ts` and implemented
per module via `implementRpc()` (`packages/core/src/lib/rpc/implement.ts`).

Two things ride on top of plain HTTP: a **contract-version handshake** —
every request carries `x-lumi-contract-version`
(`packages/contracts/src/rpc/client.ts`); the server checks it with
`contractVersionsCompatible()` and rejects a mismatch with
`CONTRACT_MISMATCH` rather than risk an undetected shape drift — and
**retryable failures** — every failure envelope carries a machine-readable
`code` and a `retryable` boolean, decided in one place
(`RpcRetryableByDefault`, `packages/contracts/src/rpc/envelope.ts`), e.g.
`CONFLICT` (idempotent replay) is retryable, `FORBIDDEN` is not.

## Consequences

Either side adds an RPC action by touching only its own contract slice and
implementation, no codegen step. The published `@lumi-devs/contracts`
package is the only thing that must stay compatible across independent
deploys, enforced at connection time instead of discovered at runtime. The
cost: `RpcClient` and `implementRpc()` are hand-maintained glue, not
generated stubs.
