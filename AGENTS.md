# AGENTS.md

Operating spec for any AI coding agent working in this repository. This is a
map, not a manual — for anything not covered here, see
[`agents/`](agents/README.md) for deep-dive reference material grounded in the
actual source (architecture, conventions, domain guides, step-by-step
workflows), or [`apps/docs/`](apps/docs/src/app/) — the public, user-facing
docs site (self-hosters and add-on authors), built from that directory on
every push to `main`.

Lumi is a self-hosted, modular Discord bot: Bun + TypeScript, `@sapphire/framework` +
discord.js v14, Prisma/PostgreSQL, Redis.

## Repo shape

Bun workspace monorepo (`workspaces: ["packages/*", "apps/*"]`). See
[`agents/architecture/`](agents/architecture/) and the
[Architecture doc site page](apps/docs/content/docs/reference/architecture.mdx) for the full
system topology — treat it as source of truth for anything below.

- `apps/worker` — the one bot entrypoint. `main.ts` is a thin discord.js `ShardingManager`
  that spawns one identical child process per shard it owns (`shard-client.ts`); every process
  owns the Discord gateway connection(s) for its shards and runs every command, module, and
  interaction handler. There is no separate scheduler role - exactly one shard per pod (the one
  holding shard id `0`) is elected "primary" with zero coordination and additionally owns BullMQ
  job scheduling and the RPC/metrics HTTP surface (`isPrimaryShard()` in `packages/core/src/lib/env.ts`).
- `apps/dashboard` — Next.js (App Router) web admin panel; talks to `worker` only over an
  internal HTTP RPC bridge, never touches Postgres/Redis directly.
- `packages/core` — the framework itself: module loader, database service, command/permit
  system, addon sandbox/SDK, and (folded in from their own former packages) the Redis Streams
  event bus (`#lib/event-bus/`) and shard telemetry for the dashboard's fleet view
  (`#lib/sharding/`) — shard assignment itself is still discord.js's `ShardingManager`, not
  custom code.
- `packages/contracts` — RPC schemas (the typed router) and shared type definitions used by
  both `worker` and `dashboard`.
- `packages/observability` — OpenTelemetry tracing, Prometheus metrics, health probes,
  wired up identically across all apps.

Only three workspace packages exist under `packages/*` today (`contracts`, `core`,
`observability`) — ESLint config and `tsconfig` bases were likewise consolidated to the repo
root (`eslint.config.mjs`, `tsconfig.base.json`) rather than their own packages.

## Import path aliases

Defined in `packages/core/package.json`'s own `"imports"` map (subpath imports, resolved via
Bun/Node) — the root `package.json` has no `"imports"` field at all; the alias vocabulary was
consolidated to two entries, both owned by `packages/core`. Always append `.js` to the
specifier even though the source is `.ts`:

| Alias | Resolves to |
| :--- | :--- |
| `#lib/*.js` | `packages/core/src/lib/*.ts` |
| `#modules/*.js` | `packages/core/src/modules/*.ts` |

Everything that used to have its own prefix (`#database/*`, `#utilities/*`, `#core/*`,
`#root/*`) now imports through `#lib/*.js` at its real path instead — e.g. Redis primitives
are `#lib/database/*.js`, card/panel builders are `#lib/ui/*.js`, generic helpers are
`#lib/utilities/*.js`. Cross-*package* imports (e.g. `packages/core` → `packages/contracts`)
must use the `@lumi/*` specifier, never a relative path across a package boundary.

## Module system & addon SDK

Feature modules live under `packages/core/src/modules/<name>/`, each exporting a class
decorated with `@DefineModule` (`packages/core/src/lib/module-system/Module.ts`), with a
per-guild config schema (`packages/core/src/lib/module-system/config-schema.ts`) and
sub-store directories (`commands/`, `listeners/`, `services/`, `interaction-handlers/`,
`scheduled-tasks/`). For the agent-facing deep dive (lifecycle hooks, config schema builders,
real gotchas), see [`agents/architecture/module-system.md`](agents/architecture/module-system.md)
and [`agents/workflows/adding-a-module.md`](agents/workflows/adding-a-module.md) — the public
doc site has no addon-authoring walkthrough yet (`apps/docs/content/docs/addons/overview.mdx`
explains why: it's deliberately withheld until the sandbox's addon-facing surface settles).

**Zero cross-module import law**: a module must never import directly from a sibling
module. Shared code belongs under `#lib/*`.

Third-party addon code (downloaded modules, symlinked into `packages/core/src/modules/`
from `data/3rd-party-modules/`) should not reach into `#lib`/`#modules` at all — the one
stable, supported import surface is the `lumi` package itself
(`packages/core/src/lib/addon-sandbox/sdk/`, exported via the root `package.json` `"exports"`
map: `lumi`, `lumi/commands`, `lumi/config`, `lumi/discord`, `lumi/interactions`, `lumi/kv`,
`lumi/permissions`, `lumi/redis`, `lumi/scheduling`, `lumi/ui`, `lumi/utils`).
Full surface: [`agents/architecture/addon-sdk.md`](agents/architecture/addon-sdk.md).

## RPC bridge (dashboard ↔ worker)

`apps/dashboard` never opens a Postgres or Redis connection and never holds the bot token.
Every read/write is proxied over an internal HTTP RPC bridge to `apps/worker`
(`apps/dashboard/src/lib/rpc.ts` calling `packages/core/src/lib/rpc/http-server.ts`, a
`server-only` module reachable only from Server Components/Route Handlers/Server Actions).

The action surface is a typed router, built from per-slice contract files under
`packages/contracts/src/rpc/*.ts` (one per module: `afk.ts`, `mod.ts`, `dashboard.ts`, ...)
and assembled by `packages/contracts/src/rpc/router.ts` into `rpcRouter`/`RpcActionName` —
there is no hand-written `RpcActions`/`RpcRequestPayloads` map to keep in sync by hand.
Adding a dashboard capability means adding an entry to the owning module's contract slice,
implementing it with `implementRpc()` (`packages/core/src/lib/rpc/implement.ts`) in that
module's own `#modules/<name>/rpc.ts` (bot-owner/system-level actions instead live in
`#lib/rpc/account-rpc.ts` / `#lib/rpc/system-rpc.ts`), and adding it to the static list in
`packages/core/src/lib/rpc/registry.ts` so it's registered even while the module is disabled.
The caller side is `apps/dashboard/src/lib/guild-reads.ts` (reads, cached with React's
`cache()`) or `apps/dashboard/src/actions/*` (mutations, Server Actions) — never a direct
database call from the dashboard.
Full walkthrough: [`agents/architecture/rpc-bridge.md`](agents/architecture/rpc-bridge.md) and
[`agents/workflows/adding-an-rpc-action.md`](agents/workflows/adding-an-rpc-action.md) — both
predate this typed-router layout and still describe the older hand-written contract, so treat
them as directionally useful rather than literal.

Full reference: [`dashboard.md`](apps/docs/content/docs/guides/dashboard.mdx). System-level view: the
[Architecture doc site page](apps/docs/content/docs/reference/architecture.mdx).

## Repo-specific anti-patterns

- **Database access**: modules go through `container.db` (`DatabaseService`), never
  `container.prisma` directly. (The only legitimate direct `container.prisma` uses are
  client bootstrap in `packages/core/src/lib/client/LumiClient.ts`; addon code touching it
  is flagged by the addon validator as an error.)
- **Cache invalidation**: shared Redis keys are invalidated via `container.invalidation`
  (`InvalidationBus`), never a raw `redis.del`.
- **Discord embeds**: never construct `new EmbedBuilder()` directly in a command/service —
  use the card builders in `#lib/ui/cards.js` (`makeInfoCard`, `makeSuccessCard`,
  `makeErrorCard`, `makeWarningCard`, `makeListCard`, ...) or, inside a command, the reply
  helpers in `#lib/commands.js` (`replySuccess`, `replyError`, `sendReply`) / the equivalent
  `ctx.replySuccess(...)` / `ctx.replyError(...)` on `CommandContext`.
- **Panels**: admin-facing panel UI (hub, config, module subpanels) uses the panel kit
  (`#lib/ui/panels.js`) builders (`settingRow`, `tabRow`, `confirmRow`, `backRow`,
  `createPaginationRow`, ...) rather than hand-rolled section/button layouts.
- **Dashboard settings pages**: a page never names a module's settings, groups or tabs
  itself — it derives them from the module's `configSchema` (`section`/`group` on each
  field) via `sectionsOf()` (`packages/contracts/src/config.ts`, imported as `@lumi/contracts`),
  and renders them with `SectionTabs` + `ConfigGroupCard`. A field added in core must appear on
  the dashboard with no dashboard change. Where a non-schema widget has to be placed by hand
  (a console, a record list), the name it matches is covered by a test against the core
  source. Background (some path/location detail there predates `sectionsOf()`'s move into
  `packages/contracts`): [`agents/domains/dashboard-design.md`](agents/domains/dashboard-design.md).
- **Permit nodes**: dot-notation permit strings (`mod.ban`, `admin.*`, ...) are not a
  hand-maintained registry — they're read live off each command's own `requiredPermit`
  (`#lib/permissions/preconditions/RequirePermit.ts`) wherever the permit system needs the
  full vocabulary (e.g. the dashboard's permit editor). There is no `/permit` bot command;
  permits are managed from the dashboard only.
- **Autocomplete**: for a STRING/NUMBER command option whose valid values are a real,
  bounded, discoverable set at runtime (an existing permit/module/repo name, not free text
  like a ban reason), wire Sapphire's `Command.autocompleteRun` rather than leaving it
  free-typed, using the shared helpers in `#lib/utilities/autocomplete.js`
  (`filterAutocompleteChoices`, `respondWithChoices`) for the case-insensitive match + 25-choice
  cap Discord's API requires. Options already using `addRoleOption`/`addChannelOption`/
  `addUserOption`/`addMentionableOption` already have a native picker - autocomplete doesn't
  apply there.

## Running things

`bun`, `gh`, etc. are provided by the Nix devshell — they are not necessarily on a plain
shell `PATH`. Enter it with `nix develop` before running any `bun`/`gh` command, or wrap
one-off commands as `nix develop --command <cmd>`.

- `bun run typecheck` — `tsc --noEmit` over the root `tsconfig.json`, then `turbo run
  typecheck`, which fans out to every workspace package's own `typecheck` script
  (`tsc --noEmit -p tsconfig.json` in each, including the dashboard's own `tsconfig`).
- `bun run lint` — `turbo run lint:all`, a root-only turbo task (not a per-package fan-out)
  that runs the root's own `lint:all` script: `eslint packages/*/src packages/core/tests
  apps/worker/src apps/dashboard/src apps/docs/src --fix`. Note it **auto-fixes**.
  `apps/dashboard` also has its own `lint` script, `eslint src` — plain ESLint, not
  `next lint`, which Next 16 removed.
- `bun run test` — `bun test --parallel` at the root (globs `packages/**`) plus
  `bun run --cwd apps/dashboard test` (also `bun test --parallel`, its own config for the
  DOM-based component tests).
- `bun run db:generate` — regenerate the Prisma client after a schema change.

## Testing conventions

Tests live alongside or under a `tests/` directory per package: `packages/core/tests/`
(mirrors `packages/core/src/lib/**`, including the former `event-bus`/`sharding` packages'
tests at `tests/lib/event-bus/` and `tests/lib/sharding/`), `packages/observability/tests/`,
and `apps/dashboard/tests/`. `packages/contracts` instead co-locates `*.test.ts` files next
to the source they cover (e.g. `packages/contracts/src/rpc/router.test.ts`). For
database-touching unit tests, `packages/core/tests/mocks/prisma.ts` provides an offline
in-memory mock Prisma driver so tests don't need a live Postgres instance.
