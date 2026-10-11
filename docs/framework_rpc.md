# Framework: RPC

The dashboard (separate repo) talks to the bot over HTTP via the embedded
RPC server (`src/lib/rpc/HttpServer.ts`, started from `src/Index.ts`).
There is no REST surface: every action is a typed entry in the contract
router under `src/contracts/rpc/`.

## Adding an action

1. Declare it in the owning slice (`src/contracts/rpc/<area>.ts`) with
   `rpcAction`, a zod input, an auth level, a timeout, and a summary.
2. Implement it in the module's own `Rpc.ts` with `implementRpc()`
   (`src/lib/rpc/Implement.ts`).

```ts
"guild.mymodule.do": rpcAction<{ success: boolean }>()({
  input: z.object({ moduleName: z.string().min(1) }),
  auth: "guildManager",
  timeoutMs: RpcTimeouts.medium,
  summary: "One line for the dashboard team.",
});
```

Auth levels: `session` (logged-in user), `guildManager` (can manage the
guild), plus owner-only actions (`system.tokens.*`). Mark pure reads
`readOnly: true`.

## Generic actions (no per-module slice needed)

- `guild.config.set` / `setMany` - validated per-key module config writes.
- `guild.module.toggle` - enable/disable a module for a guild.
- `guild.permits.*` - permit CRUD plus `move` for display order.
- `system.tokens.*` - shared service tokens, owner-only.

Slices exist for account, afk, core, dashboard, downloader, economy,
filter, logging, mod, reactionroles, security, system, tempvc, and
welcome. Sticky and utility have no dedicated slice; their config is
reachable through the generic actions above.

## Versioning

`src/contracts/Version.ts` carries `CONTRACT_VERSION` and the compatible
range. The dashboard rejects mismatched servers instead of guessing.
