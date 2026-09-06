# RPC bridge (dashboard ↔ worker)

The dashboard never opens a Postgres/Redis connection or holds the bot token. Every read and
write goes over one internal HTTP endpoint on the worker: `POST /rpc`, a flat action-string
dispatch table, not per-resource REST routes.

## The wire shape

`packages/contracts/src/rpc.ts:3-19`:

```ts
export interface RpcRequest<T = unknown> {
  id: string;
  action: string;
  guildId?: string;
  actorId?: string;
  traceparent?: string;
  tracestate?: string;
  data?: T;
}

export interface RpcResponse<T = unknown> {
  id: string;
  ok: boolean;
  data?: T;
  error?: string;
}
```

`RpcRequestPayloads` (`rpc.ts:512-587`) is the single map from action string to its `data`
payload type — 66 entries at the time of writing (count the object's own keys, don't take that
number as fixed). `RpcActions` (`rpc.ts:598-673`) is the parallel object of camelCase
constants the caller actually imports, e.g. `RpcActions.guildModNotesAdd ===
"guild.modNotes.add"`. There is no `RPC_ACTIONS` export — the real name is `RpcActions`
(worth noting since it's easy to guess the SCREAMING_CASE name by analogy with other
constant maps in this repo).

## End-to-end walkthrough of one real action: `guild.modNotes.add`

**1. Contract entry** (`packages/contracts/src/rpc.ts:401-404` and `:564`):

```ts
export interface ModNoteAddPayload {
  userId: string;
  message: string;
}
// ...
"guild.modNotes.add": ModNoteAddPayload;
```

plus the constant, `guildModNotesAdd: "guild.modNotes.add"` (`rpc.ts:650`).

**2. Handler**, registered in
`packages/core/src/modules/dashboard/rpc/moderation-rpc.ts:92-114`:

```ts
registerRpcHandler(RpcActions.guildModNotesAdd, async (req) => {
  const guildId = requireGuildId(req.guildId);
  const actorId = await requireGuildManager(guildId, req.actorId);
  const { userId, message } = parsePayload(ModNoteAddSchema, req.data);

  await container.db.ensureGuild(guildId);
  const note = await container.db.modNotes.create(guildId, userId, actorId, message);
  return {
    success: true,
    note: {
      id: note.id, userId: note.userId, authorId: note.authorId,
      message: note.message, createdAt: note.createdAt.toISOString(),
    },
  };
});
```

`ModNoteAddSchema` (a Shapeshift schema, `packages/core/src/modules/dashboard/lib/helpers.ts:410-413`)
re-validates the payload server-side — the contract's TypeScript type is compile-time only and
gives zero runtime guarantee across a wire boundary the dashboard and worker deploy
independently across. `requireGuildManager` (`helpers.ts:47-64`) is the authorization check:
it re-fetches the actor's live guild membership from the bot's own cache (`ManageGuild` or
`Administrator`, or guild owner) rather than trusting anything cached in the dashboard
session, since that session can be stale up to `SESSION_TTL_MS`.

Handlers for one domain are grouped into one file with a `register*RpcHandlers()` /
`unregister*RpcHandlers()` pair (moderation, guild, permits, cases, security, tempvc,
reactionroles, audit, logging — see `packages/core/src/modules/dashboard/rpc/*.ts`), wired up
from the `dashboard` module's own `onLoad`/`onUnload`
(`packages/core/src/modules/dashboard/index.ts:55-85`). A handful of bot-owner-only,
non-guild-scoped actions (GDPR, downloader/repo management, system panel) live directly in
`packages/core/src/lib/rpc/core-rpc.ts` and are registered once from `LumiClient`'s boot
sequence instead, not from the `dashboard` module's lifecycle.

**3. Caller** — this is a *mutation*, so it lives in a Server Action, not `dashboard-fetch.ts`
(`apps/dashboard/src/actions/mod-notes-actions.ts:18-33`):

```ts
"use server";

export async function addModNote(guildId: string, userId: string, message: string) {
  return runAction(async () => {
    const session = await guardedModNotesAction(guildId); // requireGuild() + rate limit
    await rpcCall(RpcActions.guildModNotesAdd, {
      guildId,
      actorId: session.userId,
      data: { userId, message },
    });
    revalidatePath(`/guild/${guildId}/moderation/notes`);
    return { ok: true };
  });
}
```

`session.userId` — never a client-supplied `actorId` — becomes the wire `actorId`. This is
the trust chain the whole bridge rests on: the dashboard authenticates the *human* via
next-auth session (`requireGuild`, `apps/dashboard/src/lib/auth-guards.ts:20-24`, which 404s
rather than 403s on an unauthorized guild to avoid confirming the guild exists) and only then
attaches that session's own user id as `actorId` — the worker trusts `actorId` at all only
because the transport itself is separately authenticated (next section).

Adding a new action means exactly these three edits — contract entry, handler
registration, caller — and nothing else; there's no code generation step, no schema registry
to update elsewhere.

## Reads vs. mutations

- **Reads** go through `apps/dashboard/src/lib/dashboard-fetch.ts`, wrapped in React's
  `cache()` (e.g. `getGuildDashboard`, `dashboard-fetch.ts:43-51`) so multiple Server
  Components rendering the same request-scoped data don't refetch. These are plain async
  functions, not Server Actions — no `"use server"`, no rate limiting, no
  `revalidatePath`.
- **Mutations** live under `apps/dashboard/src/actions/*.ts`, each file `"use server"`,
  each exported function wrapped in `runAction` (`apps/dashboard/src/lib/action-result.ts:8-19`)
  which converts a thrown `Error` into `{ ok: false, error }` while still letting
  Next's `redirect()`/`notFound()` control-flow throws pass through via `unstable_rethrow`.
  Mutations also typically rate-limit via `isRateLimited` and call `revalidatePath` after a
  successful write — reads never do either.

## Transport auth: `RPC_INTERNAL_TOKEN`

`packages/core/src/lib/rpc/http-server.ts` is the actual HTTP surface — a raw `Bun.serve`,
not Express/Fastify. Two routes only: unauthenticated `GET /healthz` (liveness/readiness
probes have no way to hold a secret, and it discloses nothing beyond "process is up",
`http-server.ts:81-85`) and `POST /rpc` for everything else.

Every `/rpc` call must carry `Authorization: Bearer <RPC_INTERNAL_TOKEN>`, checked with a
constant-time comparison over SHA-256 digests of the token, not the raw strings
(`tokenMatches`, `http-server.ts:39-42`) — deliberately so neither the byte values nor the
token's *length* leak through response timing. `readInternalToken` (`http-server.ts:51-74`)
refuses to boot in production if `RPC_INTERNAL_TOKEN` is unset; in development it logs a loud
warning and runs unauthenticated instead. `startRpcHttpServer` additionally refuses to bind to
any non-loopback host without a token set (`http-server.ts:131-137`) — binding
`RPC_HTTP_HOST` beyond `127.0.0.1` with no token throws at startup rather than silently serving
open. On the dashboard side, `RpcClient.call` (`apps/dashboard/src/lib/rpc.ts:34-100`) always
attaches the bearer header (`rpc.ts:66-69`) and is itself `server-only` — the module import
throws if anything tries to pull it into a client bundle.

Reachability is explicitly *not* treated as authorization — the `http-server.ts` file's own
top comment spells out that anything on the docker network (or with an SSRF primitive aimed at
it) can open a socket to `/rpc`, and `actorId` in the body is an *unsigned claim* the handlers
act on. The token check is what makes trusting `actorId` downstream (as `guild.modNotes.add`'s
handler does above) safe at all.

## `dispatchRpc` — the transport-agnostic core

`packages/core/src/lib/rpc/dispatch.ts:34-89`. `http-server.ts` is presently the only caller,
but the split exists so a future transport (the file comment mentions this) just needs its own
auth before calling in. Two checks happen before the handler runs:

1. Handler lookup by exact `action` string; unknown action returns `{ ok: false, error: ... }`
   with **no HTTP-level distinction** — this always comes back as HTTP 200 with `ok: false` in
   the JSON body, not a 404. Only auth failures (401) and malformed JSON/missing `action`
   (400) get non-200 status codes (`http-server.ts:89-109`); everything else, including
   "handler not found" and any handler-thrown error, is 200 with `ok: false`.
2. `req.guildId && !(await container.db.config.isDashboardEnabled(req.guildId))` — a guild can
   opt out of the dashboard entirely; every guild-scoped action respects this uniformly at the
   dispatch layer rather than each handler re-checking it.

Handler execution runs inside `runWithContext(...)` for tracing/correlation
(`dispatch.ts:51-88`), and Prisma errors get a dedicated `handlePrismaError` scrub
(`dispatch.ts:76-80`) before the error message crosses the wire — the comment is explicit that
a raw Prisma error message can carry the query/file path/line, while a plain thrown
`Error("...")` from application code (e.g. `"A permit named X already exists."`) is meant to
reach the caller verbatim. If you throw inside a handler for a user-facing reason, throw a
plain `Error` with a clean message; don't let a raw Prisma exception escape uncaught.

## Gotchas actually found in the code

- **8-second client-side timeout, not configurable per dashboard route by default.**
  `RpcClient.call`'s `DefaultTimeoutMs = 8000` (`apps/dashboard/src/lib/rpc.ts:13`) aborts via
  `AbortController` and throws `RPC timed out: <action>` — a slow handler (large `guild.audit.list`
  page, a big backup restore) needs either a real perf fix or an explicit `timeoutMs` override
  passed through `CallOptions`, not just "it'll be fine."
- **A malformed response is deliberately swallowed, not surfaced verbatim.** If the worker's
  JSON body doesn't parse or doesn't match the `RpcResponse` envelope (`parseRpcResponse`,
  `packages/contracts/src/rpc.ts:30-37`, itself Shapeshift-validated since dashboard and
  worker can be on different deployed versions), `RpcClient.call` logs and throws a generic
  `RPC <action>: malformed response` rather than leaking the raw body (`rpc.ts:82-96`).
- **Every action's `data` payload is trusted exactly once — at the handler, not the wire
  layer.** `dispatchRpc` never validates `req.data` against anything; each handler owns its own
  `parsePayload(SomeSchema, req.data)` call. A new handler that skips this has zero
  request-shape validation, contract types notwithstanding.
- **`req.actorId` absence is a handler-by-handler decision, not automatic.** Some actions are
  intentionally public/unauthenticated — `guild.appeals.verify` and `guild.appeals.submit`
  (`moderation-rpc.ts:126,147`, both explicitly commented "Public, unauthenticated: reachable
  by a punished user with no dashboard access at all") rely on a signed per-case appeal token
  instead of `actorId`/session. Don't assume every guild-scoped action requires
  `requireGuildManager`; check the specific handler.
- **Bot-owner checks re-derive from `PermitResolver.isBotOwner`, not an env var list.**
  `requireBotOwner` (`packages/core/src/lib/rpc/core-rpc.ts:29-34`) and `auth.whoami`'s handler
  (`core-rpc.ts:127-129`) both defer to the same resolver so the dashboard doesn't need its
  own hardcoded owner list — `auth.whoami` exists specifically so the dashboard can ask the
  worker "is this actorId the owner" instead of guessing.
