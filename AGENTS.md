# AGENTS.md

Operating spec for any AI coding agent working in this repository. This is a
map, not a manual — for anything not covered here, see [`docs/README.md`](docs/README.md)
(the documentation index) or the [GitHub wiki](https://github.com/lumi-devs/Lumi/wiki),
which mirrors `docs/` on every push to `main`.

Lumi is a self-hosted, modular Discord bot: Bun + TypeScript, `@sapphire/framework` +
discord.js v14, Prisma/PostgreSQL, Redis, RabbitMQ.

## Repo shape

Bun workspace monorepo (`workspaces: ["packages/*", "apps/*"]`). See
[`docs/architecture.md`](docs/architecture.md) for the full system topology — treat it as
source of truth for anything below.

- `apps/worker` — owns the Discord gateway connection(s); runs every command, module, and
  interaction handler.
- `apps/scheduler` — owns BullMQ delayed/cron job queues; never opens a gateway connection.
- `apps/dashboard` — Next.js (App Router) web admin panel; talks to `worker` only over
  RabbitMQ RPC, never touches Postgres/Redis directly.
- `packages/core` — the framework itself: module loader, database service, command/permit
  system, addon SDK.
- `packages/contracts` — RPC schemas and shared type definitions used by both `worker` and
  `dashboard`.
- `packages/event-bus` — Redis Streams event bus between `worker` and `scheduler`.
- `packages/sharding` — shard planner, cluster coordinator, session store for horizontal
  scaling.
- `packages/observability` — OpenTelemetry tracing, Prometheus metrics, health probes,
  wired up identically across all apps.
- `packages/eslint-config` — shared ESLint config consumed by every workspace package.
- `packages/typescript-config` — shared `tsconfig` bases, same deal.

## Import path aliases

Defined in the root `package.json` `"imports"` map (subpath imports, resolved via Bun/Node).
Always append `.js` to the specifier even though the source is `.ts`:

| Alias | Resolves to |
| :--- | :--- |
| `#lib/*.js` | `packages/core/src/lib/*.ts` |
| `#database/*.js` | `packages/core/src/lib/database/*.ts` |
| `#utilities/*.js` | `packages/core/src/lib/utilities/*.ts` |
| `#core/lib/*.js`, `#core/*.js` | `packages/core/src/lib/*.ts` |
| `#core/module-system/*.js` | `packages/core/src/lib/module-system/*.ts` |
| `#root/*.js` | `packages/core/src/*.ts` |
| `#modules/*.js` | `packages/core/src/modules/*.ts` |

A handful of hot paths (`commands.js`, `env.js`, `permissions.js`, `module-system.js`,
`rabbit.js`, `types.js`, `guild-transaction.js`, `module-check.js`, `scheduler-bus.js`,
`schedule-task.js`) have explicit non-wildcard entries — check `package.json` if a wildcard
import doesn't resolve as expected. Cross-*package* imports (e.g. `packages/core` →
`packages/event-bus`) must use the `@lumi/*` specifier, never a relative path across a
package boundary.

## Module system & addon SDK

Feature modules live under `packages/core/src/modules/<name>/`, each exporting a class
decorated with `@DefineModule` (`packages/core/src/lib/module-system/Module.ts`), with a
per-guild config schema (`packages/core/src/lib/module-system/config-schema.ts`) and
sub-store directories (`commands/`, `listeners/`, `services/`, `interaction-handlers/`,
`scheduled-tasks/`). Full walkthrough: [`docs/GUIDE_MODULE_CREATION.md`](docs/GUIDE_MODULE_CREATION.md).

**Zero cross-module import law**: a module must never import directly from a sibling
module. Shared code belongs in `#lib/*`, `#database/*`, or `#utilities/*`.

Third-party addon code (downloaded modules, symlinked into `packages/core/src/modules/`
from `data/3rd-party-modules/`) should not reach into `#core`/`#lib`/`#database`/`#utilities`
at all — the one stable, supported import surface is the `lumi` package itself
(`packages/core/src/lib/addon-sdk/`, exported via the root `package.json` `"exports"` map:
`lumi`, `lumi/commands`, `lumi/permissions`, `lumi/scheduling`, `lumi/ui`, `lumi/utils`).
Full surface: [`docs/API_REFERENCE.md`](docs/API_REFERENCE.md).

## RPC bridge (dashboard ↔ worker)

`apps/dashboard` never opens a Postgres or Redis connection and never holds the bot token.
Every read/write is proxied over RabbitMQ RPC to `apps/worker` (`apps/dashboard/src/lib/rpc.ts`,
a `server-only` module reachable only from Server Components/Route Handlers/Server Actions).

The action surface is exactly **50 actions**, defined once in `packages/contracts/src/rpc.ts`:
`RpcRequestPayloads` maps each wire action string to its `data` payload, and `RPC_ACTIONS`
gives the caller-side constants. Adding a dashboard capability means adding an entry there,
a handler in `packages/core/src/lib/rpc/core-rpc.ts`, and a caller in
`apps/dashboard/src/lib/dashboard-fetch.ts` (reads) or `apps/dashboard/src/actions/*` (mutations)
— never a direct database call from the dashboard.

Full reference: [`docs/dashboard.md`](docs/dashboard.md). System-level view: the
"Dashboard Frontend" section of [`docs/architecture.md`](docs/architecture.md).

## Repo-specific anti-patterns

- **Database access**: modules go through `container.db` (`DatabaseService`), never
  `container.prisma` directly. (The only legitimate direct `container.prisma` uses are
  client bootstrap in `packages/core/src/lib/client/LumiClient.ts`; addon code touching it
  is flagged by the addon validator as an error.)
- **Cache invalidation**: shared Redis keys are invalidated via `container.invalidation`
  (`InvalidationBus`), never a raw `redis.del`.
- **Discord embeds**: never construct `new EmbedBuilder()` directly in a command/service —
  use the card builders in `#utilities/cards.js` (`makeInfoCard`, `makeSuccessCard`,
  `makeErrorCard`, `makeWarningCard`, `makeListCard`, ...) or, inside a command, the reply
  helpers in `#lib/commands.js` (`replySuccess`, `replyError`, `sendReply`) / the equivalent
  `ctx.replySuccess(...)` / `ctx.replyError(...)` on `CommandContext`.
- **Panels**: admin-facing panel UI (hub, config, module subpanels) uses the panel kit
  (`#utilities/panels.js`) builders (`settingRow`, `tabRow`, `confirmRow`, `backRow`,
  `createPaginationRow`, ...) rather than hand-rolled section/button layouts.
- **Permit nodes**: the canonical vocabulary of dot-notation permit strings (`mod.ban`,
  `admin.*`, ...) lives in `packages/core/src/lib/permissions/permit-nodes.ts`, sourced from
  every command's actual `requiredPermit`. Register a new node there when adding a
  permit-gated command so the dashboard's permit editor and `/permit`'s autocomplete both
  pick it up automatically.
- **Autocomplete**: for a STRING/NUMBER command option whose valid values are a real,
  bounded, discoverable set at runtime (an existing permit/module/repo name, not free text
  like a ban reason), wire Sapphire's `Command.autocompleteRun` rather than leaving it
  free-typed, using the shared helpers in `#utilities/autocomplete.js`
  (`filterAutocompleteChoices`, `respondWithChoices`) for the case-insensitive match + 25-choice
  cap Discord's API requires. Options already using `addRoleOption`/`addChannelOption`/
  `addUserOption`/`addMentionableOption` already have a native picker - autocomplete doesn't
  apply there.

## Running things

`bun`, `gh`, etc. are provided by the Nix devshell — they are not necessarily on a plain
shell `PATH`. Enter it with `nix develop` before running any `bun`/`gh` command, or wrap
one-off commands as `nix develop --command <cmd>`.

- `bun run typecheck` — `turbo run typecheck:all` (`tsc --noEmit` over the root
  `tsconfig.json`) plus `turbo run typecheck --filter=@lumi/dashboard`, since the dashboard
  has its own `tsconfig`.
- `bun run lint` — `turbo run lint:all`, which is `eslint packages/*/src apps/worker/src
  apps/scheduler/src apps/dashboard/src --fix`. Note it **auto-fixes**. `apps/dashboard` also
  has its own `lint` script, `eslint src` — plain ESLint, not `next lint`, which Next 16
  removed.
- `bun run test` — `vitest run` at the root (globs `packages/**`, `node` environment) plus
  `bun run --cwd apps/dashboard test`, which has its own config for the DOM-based
  component tests.
- `bun run db:generate` — regenerate the Prisma client after a schema change.

## Testing conventions

Tests live alongside or under a `tests/` directory per package (`packages/core/tests/`,
`packages/event-bus/tests/`, `packages/sharding/tests/`, `packages/observability/tests/`,
`apps/dashboard/tests/`). For
database-touching unit tests, `packages/core/tests/mocks/prisma.ts` provides an offline
in-memory mock Prisma driver so tests don't need a live Postgres instance.
