# RPC bridge (dashboard ↔ api)

> The dashboard now lives in its own repo, [`lumi-devs/lumi-dashboard`](https://github.com/lumi-devs/lumi-dashboard).
> Paths below that used to be `apps/dashboard/...` in this repo are now repo-root-relative
> there (e.g. `src/lib/rpc.ts` in `lumi-dashboard`).

The dashboard never opens a Postgres/Valkey connection or holds the bot token. Every read and
write goes over internal HTTP endpoints served by the headless `apps/api` process (`POST /rpc` and `POST /rpc/batch`),
dispatching to a typed router backed by `@lumi/contracts`.

## Architecture Topology

```text
lumi-dashboard (Next.js)
       ↓
@lumi/contracts RPC Client
       ↓  (HTTP POST /rpc or POST /rpc/batch with Bearer RPC_INTERNAL_TOKEN)
apps/api (rpc-http-server.ts)
       ↓
dispatchRpc()
       ↓
implementRpc() typed handlers
       ↓
Database / Cache / Domain Services
```

## The wire shape

`packages/contracts/src/rpc/envelope.ts`:

```ts
export interface RpcRequest<T = unknown> {
  id: string;
  action: string;
  guildId?: string;
  actorId?: string;
  idempotencyKey?: string;
  traceparent?: string;
  tracestate?: string;
  data?: T;
}

export interface RpcResponse<T = unknown> {
  id: string;
  ok: boolean;
  data?: T;
  error?: string;
  code?: RpcFailureCode;
  retryable?: boolean;
  retryAfterMs?: number;
}

export interface RpcBatchRequest {
  requests: RpcRequest<unknown>[];
}

export interface RpcBatchResponse {
  responses: RpcResponse<unknown>[];
}
```

## Typed Routers & Slices

Contracts are split per module domain in `packages/contracts/src/rpc/*.ts` (e.g. `mod.ts`, `afk.ts`, `system.ts`)
and merged into `rpcRouter` in `packages/contracts/src/rpc/router.ts`.

Each route specifies:
- `auth`: `"guildManager"` | `"botOwner"` | `"session"` | `"public"`
- `permission?`: fine-grained permit string required
- `input?`: Zod schema for runtime payload validation
- `timeoutMs`: action deadline
- `readOnly?`: whether the call is safe to retry on transport errors
- `idempotent?`: whether the mutation accepts idempotency deduplication

## Handler Implementation with `implementRpc()`

Handlers never process untyped request objects manually. `implementRpc()` handles authentication,
tenant verification, payload parsing, and module enablement checks automatically:

```ts
export const modRpcHandlers = implementRpc(modRpc, {
  "guild.modNotes.add": async ({ guildId, actorId, input }) => {
    const { userId, message } = input;
    const note = await container.db.modNotes.create(guildId, userId, actorId, message);
    return {
      note: {
        id: note.id,
        userId: note.userId,
        authorId: note.authorId,
        message: note.message,
        createdAt: note.createdAt.toISOString(),
      },
    };
  },
});
```

## Batch Processing (`POST /rpc/batch`)

`apps/api` accepts batches of requests concurrently in a single HTTP round-trip:

```json
{
  "requests": [
    { "id": "1", "action": "guild.modules.list", "guildId": "..." },
    { "id": "2", "action": "guild.config.get", "guildId": "...", "data": { "key": "prefix" } }
  ]
}
```

Each sub-request produces its own `RpcResponse` in `responses`, isolating errors so that one failed
request does not fail the entire batch.

## Idempotency

Mutations can pass `idempotencyKey` in `RpcRequest`. `withIdempotency()` acquires a distributed Valkey lock,
returning cached results on replay or rejecting concurrent duplicates with `CONFLICT`.

## Dashboard client behavior (`packages/contracts/src/rpc/client.ts`)

Reads (router `readOnly` actions) retry on transport failures *and* on
server-directed retryable envelopes, honoring `retryAfterMs` as the backoff
floor — mutations never retry. A circuit breaker fails fast against a dead
`apps/api` (5 consecutive transport failures, 10s cooldown). Response bodies
are capped at 10MB (content-length fast path + bounded reader), oversized
bodies surface as `MALFORMED`.

## Contract Versioning & Compatibility Handshake

The dashboard and `apps/api` are deployed independently and cross network boundaries. To ensure stability
without breaking during independent release cadences, `apps/api` validates callers using an npm-style
semver range handshake:

1. **Wire Handshake**: Every request carries the caller's contract version in `x-lumi-contract-version` (`packages/contracts/src/rpc/client.ts`).
2. **Compatibility Resolution (`packages/contracts/src/rpc/contract-version.ts`)**:
   - `CONTRACT_VERSION`: The package's current release version.
   - `MIN_COMPATIBLE_CONTRACT_VERSION`: The backwards-compatibility floor (e.g. `0.6.0`).
   - `COMPATIBLE_CONTRACT_RANGE`: Formatted semver range (e.g. `>=0.6.0 <=0.7.0`).
   - Callers reporting concrete versions or semver ranges within this range are admitted.
   - Differing major versions are always rejected.
   - In 0.x, bumping minor versions no longer breaks existing callers unless `MIN_COMPATIBLE_CONTRACT_VERSION` is explicitly raised.
3. **Structured Failure & Logging**:
   - Incompatible or missing versions yield HTTP `409` with code `CONTRACT_MISMATCH`.
   - The response includes headers `x-lumi-contract-version` and `x-lumi-contract-range` so clients can inspect server compatibility.
   - Failures are logged with structured metadata (`clientVersion`, `serverVersion`, `supportedRange`) on both server (`apps/api`) and client (`RpcClient`).

