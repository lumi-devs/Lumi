# AGENTS.md

Operating spec for any AI coding agent working in this repository.

Lumi is a self-hosted, modular Discord bot: Bun + TypeScript, discord.js v14
(native, no framework), Prisma/PostgreSQL, Valkey. Single-process monolith.

## Repo shape

```
src/
  Index.ts        # the one boot: db -> modules -> slash register -> RPC -> gateway -> scheduling
  modules/<name>/ # self-contained feature modules
    Index.ts      # defineModule({...}) entrypoint
    commands/ listeners/ interactions/ tasks/ utilities/ services/ data/
    config-schema via defineModule options, manifest.json (discovery fast path)
  lib/            # shared framework (database, cache, permits, scheduler, rpc, ui, utilities...)
  contracts/      # typed RPC router + schemas for the dashboard bridge
  cli/            # `lumi` command-line tool
  observability/  # OpenTelemetry tracing, Prometheus metrics, health probes
  shared/         # tiny shared primitives (being replaced by @sapphire/*)
tests/            # mirrors src/ (tests/core, tests/api, tests/cli)
data/addons/      # third-party addon root, same module shape, same loader
```

Import aliases (`tsconfig.base.json` paths, honored by Bun at runtime):
`#src/*` -> `src/*`, `#lib/*` -> `src/lib/*`. Code uses `#src/*`
canonically. Always keep the `.js` suffix on relative specifiers.

## Module system

Feature modules live under `src/modules/<name>/`, each exporting a
`defineModule({...})` object (`src/lib/module-system/Module.ts`).
`src/lib/module-system/ModuleStore.ts` discovers across multiple roots
(core `src/modules` + `data/addons`), sorts dependencies topologically,
and loads every module in-process — core modules and addons share the
piece loaders, with a separate `#loadAddon` path per origin. There is no
sandbox, no isolate, no SDK: modules import `#lib/*` directly.

**Zero cross-module import law**: a module must never import from a
sibling module. Shared code belongs under `src/lib/*`.

## RPC bridge (dashboard ↔ bot)

The dashboard (separate repo) talks to the embedded RPC server
(`src/lib/rpc/HttpServer.ts`, started from `src/Index.ts`) over HTTP.
The action surface is a typed router built from
`src/contracts/rpc/*.ts` slices, implemented with `implementRpc()`
(`src/lib/rpc/Implement.ts`) in each module's own `Rpc.ts`.
`guild.permits.*` covers the permit system including display-order moves.

## Permits

Wick-style permit nodes (`mod.ban`, `admin.*`) evaluated by
`PermitResolver` (`src/lib/api/permissions/PermitResolver.ts`): owner bypass
> enforced user > custom user > channel > roles (position order), deny
first per tier. All decisions go through `authorize()`
(`src/lib/api/permissions/Authorize.ts`) — never touch `PermitResolver`
directly from rpc/preconditions code. Permits carry a `position` display
order, reorderable via RPC (`guild.permits.move`), the hub panel
(`↕ Order`), and the dashboard.

## Repo-specific anti-patterns

- **Database access**: modules go through `container.db`, never
  `container.prisma` directly.
- **Discord embeds**: never construct `new EmbedBuilder()` in a command —
  use the card builders in `#src/lib/ui/Cards.js` or `ctx.replySuccess` /
  `ctx.replyError`. Pure string formatting lives in `#src/lib/ui/Format.js`.
- **No shims**: never add compatibility re-exports or alias layers.
  Replace, don't wrap. No code comments in new or edited code.
- **No framework**: discord.js native only. Framework-independent
  `@sapphire/*` packages (`utilities`, `duration`, `snowflake`,
  `async-queue`, `ratelimits`) are approved for replacing hand-rolled code.

## Running things

`bun`, `gh`, etc. come from the Nix devshell: `nix develop --command <cmd>`.

- `bun run typecheck` — single `tsc --noEmit` over `src` + `tests`.
- `bun run lint` / `bun run lint:fix` — eslint over `src tests`.
- `bun run test` — `bun test tests/`.
- `bun run db:generate` — regenerate the Prisma client after a schema change.
- `bun run db:migrate` — `prisma migrate dev` (needs Postgres up).
- `bun src/Index.ts` — run the bot. `lumi` bin -> `src/cli/Main.ts`.
