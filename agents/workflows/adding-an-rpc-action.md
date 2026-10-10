# Adding an RPC action (dashboard capability)

Three steps, all in this repo. The dashboard side (separate `lumi-dashboard`
repo) calls it by name — reads via `guild-reads.ts` (cached with `cache()`),
mutations via `src/actions/*` Server Actions. Background:
`agents/architecture/rpc-bridge.md`.

## 1. Contract entry in the owning slice

One file per domain under `packages/contracts/src/rpc/*.ts`, assembled into
`rpcRouter`/`RpcActionName` by `router.ts` — there is no hand-written action
map. Example (`mod.ts`):

```ts
"guild.modNotes.add": rpcAction<{ success: boolean; note: ModNoteView }>()({
  input: z.object({
    userId: SnowflakeSchema,
    message: z.string().min(1).max(1000),
  }),
  auth: "guildManager",
  timeoutMs: RpcTimeouts.long,
  summary: "Add a moderator note.",
}),
```

`auth`: `"guildManager"` | `"botOwner"` | `"session"` | `"public"`, plus an
optional permit string. Mark reads `readOnly: true` — only those are ever
retried by the dashboard client, and a retried mutation could double its side
effect. `timeoutMs` from `RpcTimeouts`; every call runs under a deadline.

## 2. Handler with `implementRpc()` in the module's own `rpc.ts`

```ts
export const modRpcHandlers = implementRpc(modRpc, {
  "guild.cases.list": async ({ guildId, input }) => {
    // ...container.db... return plain JSON
  },
});
```

Auth, tenant checks, payload parsing, and module enablement are automatic —
the handler receives `{ guildId, actorId, input }` and returns JSON. Throw
`CodedRpcError` (codes in `RpcFailureCodes`) for user-facing failures; raw
errors are scrubbed by `dispatchRpc` (`lib/rpc/dispatch.ts`). Bot-owner and
system-level actions live in `lib/rpc/account-rpc.ts` / `system-rpc.ts`
instead. Failures can carry `retryable` + `retryAfterMs` — the dashboard
client honors both on reads.

## 3. Register in the static list

Add the slice to `packages/core/src/lib/rpc/registry.ts` so it registers even
while the module is disabled. No codegen, no dispatcher changes.

## Compatibility

`apps/api` enforces the contract-version handshake (`CONTRACT_MISMATCH` on
mismatch). Additive changes ride free; breaking wire changes require bumping
`MIN_COMPATIBLE_CONTRACT_VERSION` — and a changeset (minor for additive
contract changes).
