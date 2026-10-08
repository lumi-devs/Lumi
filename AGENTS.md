# AGENTS.md

Operating spec for any AI coding agent working in this repository. This is a
map, not a manual — for anything not covered here, see
[`agents/`](agents/README.md) for deep-dive reference material grounded in the
actual source (architecture, conventions, domain guides, step-by-step
workflows), or the public, user-facing docs site at
https://lumi-devs.github.io/Lumi-docs (self-hosters and add-on authors) — its content lives
in the separate [`lumi-devs/Lumi-docs`](https://github.com/lumi-devs/Lumi-docs) repo. For why a given architectural shape was chosen, see
[`docs/adr/`](docs/adr/README.md).

Lumi is a self-hosted, modular Discord bot: Bun + TypeScript, discord.js v14
(native runtime, no framework), Prisma/PostgreSQL, Valkey.

## Repo shape

Bun workspace monorepo (`workspaces: ["packages/*", "apps/*"]`). See
[`agents/architecture/`](agents/architecture/) and the
[Architecture doc site page](https://lumi-devs.github.io/Lumi-docs/reference/architecture) for the full
system topology — treat it as source of truth for anything below.

- `apps/worker` — the one bot entrypoint. `main.ts` is a thin discord.js `ShardingManager`
  that spawns one identical child process per shard it owns (`shard-client.ts`); every process
  owns the Discord gateway connection(s) for its shards and runs every command, module, and
  interaction handler. `isPrimaryShard()` gates only the shared metrics port / cluster readiness
  probes (see `apps/worker/src/telemetry.ts`); BullMQ job scheduling is owned by a separate
  `apps/scheduler` process (see below). RPC serving is not part of any shard role — it's a
  separate `apps/api` process (see below), not gated by shard/`isPrimaryShard()` at all.
- `apps/api` — gateway-free RPC server for the dashboard. Boots a `SapphireClient` without
  calling `.login()`, registers `packages/core/src/lib/rpc/*` handlers
  (`registerRpcHandlers()`), and owns its own HTTP transport (`apps/api/src/rpc-http-server.ts`,
  `startRpcHttpServer()`) that serves them. No BullMQ, no Discord gateway connection.
- `apps/scheduler` — gateway-free BullMQ worker and scheduler. Owns job processing,
  repeatable-job registration, and the cluster-wide scheduler lock. No Discord gateway
  connection, no RPC serving.
- The dashboard (Next.js App Router web admin panel) lives in its own repo,
  [`lumi-devs/lumi-dashboard`](https://github.com/lumi-devs/lumi-dashboard), published as the
  `ghcr.io/lumi-devs/lumi-dashboard` image. It talks to `apps/api` only over the internal HTTP
  RPC bridge, never touches Postgres/Valkey directly, and consumes `@lumi-devs/contracts` /
  `@lumi-devs/observability` from npm rather than importing this repo's source — see
  "Releasing contracts" below for how a contracts change reaches it.
- `packages/core` — the bot framework and runtime: module loader, command/permit
  system, addon sandbox/SDK, event bus (`#lib/event-bus/`), and shard telemetry (`#lib/sharding/`).
- `packages/application` — business logic layer: extracted module services and application interfaces.
- `packages/infrastructure` — data & infrastructure abstractions: database repositories, Valkey cache/mutexes,
  and BullMQ job queue abstractions.
- `packages/contracts` — RPC schemas (the typed router), domain events, and shared type definitions used by
  `worker`, `api`, and, via the published `@lumi-devs/contracts` package, the dashboard repo.
- `packages/observability` — OpenTelemetry tracing, Prometheus metrics, health probes,
  wired up identically across all apps.

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
`#root/*`) now imports through `#lib/*.js` at its real path instead — e.g. Valkey primitives
are `#lib/database/*.js`, card/panel builders are `#lib/ui/*.js`, generic helpers are
`#lib/utilities/*.js`. Cross-*package* imports (e.g. `packages/core` → `packages/contracts`)
must use the `@lumi/*` specifier, never a relative path across a package boundary.

## Module system & addon SDK

Feature modules live under `packages/core/src/modules/<name>/`, each exporting a class
decorated with `@DefineModule` (`packages/core/src/lib/module-system/Module.ts`), with a
per-guild config schema (`packages/core/src/lib/module-system/config-schema.ts`) and
sub-store directories (`commands/`, `listeners/`, `services/`, `interactions/`,
`scheduled-tasks/`). For the agent-facing deep dive (lifecycle hooks, config schema builders,
real gotchas), see [`agents/architecture/module-system.md`](agents/architecture/module-system.md)
and [`agents/workflows/adding-a-module.md`](agents/workflows/adding-a-module.md). The public doc
site's addon-facing surface is the generated
[SDK Reference](https://lumi-devs.github.io/Lumi-docs/addons/sdk-reference) (every export of
`packages/core/src/lib/addon-sandbox/sdk/`, regenerated from source on every docs build) plus
[Addons Overview](https://lumi-devs.github.io/Lumi-docs/addons/overview) for the
sandbox's execution model.

**Zero cross-module import law**: a module must never import directly from a sibling
module. Shared code belongs under `#lib/*`.

Third-party addon code (downloaded modules, symlinked into `packages/core/src/modules/`
from `data/3rd-party-modules/`) should not reach into `#lib`/`#modules` at all — the one
stable, supported import surface is the `lumi` package itself
(`packages/core/src/lib/addon-sandbox/sdk/`, exported via the root `package.json` `"exports"`
map: `lumi`, `lumi/commands`, `lumi/config`, `lumi/discord`, `lumi/interactions`, `lumi/kv`,
`lumi/permissions`, `lumi/valkey`, `lumi/scheduling`, `lumi/ui`, `lumi/utils`).
Full surface: [`agents/architecture/addon-sdk.md`](agents/architecture/addon-sdk.md).

## RPC bridge (dashboard ↔ api)

The dashboard (in the separate `lumi-devs/lumi-dashboard` repo) never opens a Postgres or Valkey
connection and never holds the bot token. Every read/write is proxied over an internal HTTP RPC
bridge to `apps/api` (the dashboard's own `src/lib/rpc.ts` calling into this repo's
`apps/api/src/rpc-http-server.ts`, a `server-only` module reachable only from Server
Components/Route Handlers/Server Actions).

The action surface is a typed router, built from per-slice contract files under
`packages/contracts/src/rpc/*.ts` (one per module: `afk.ts`, `mod.ts`, `dashboard.ts`, ...)
and assembled by `packages/contracts/src/rpc/router.ts` into `rpcRouter`/`RpcActionName` —
there is no hand-written `RpcActions`/`RpcRequestPayloads` map to keep in sync by hand.
Adding a dashboard capability means adding an entry to the owning module's contract slice,
implementing it with `implementRpc()` (`packages/core/src/lib/rpc/implement.ts`) in that
module's own `#modules/<name>/rpc.ts` (bot-owner/system-level actions instead live in
`#lib/rpc/account-rpc.ts` / `#lib/rpc/system-rpc.ts`), and adding it to the static list in
`packages/core/src/lib/rpc/registry.ts` so it's registered even while the module is disabled.
The caller side, in the dashboard repo, is `src/lib/guild-reads.ts` (reads, cached with React's
`cache()`) or `src/actions/*` (mutations, Server Actions) — never a direct database call from
the dashboard.
Full walkthrough: [`agents/architecture/rpc-bridge.md`](agents/architecture/rpc-bridge.md) and
[`agents/workflows/adding-an-rpc-action.md`](agents/workflows/adding-an-rpc-action.md) — both
predate this typed-router layout and still describe the older hand-written contract, so treat
them as directionally useful rather than literal.

### Releasing contracts

Versions are managed with [Changesets](https://github.com/changesets/changesets) (`.changeset/`,
`bun run changeset`). Every PR that touches `packages/` or `apps/` must include a changeset file
(CI enforces this); docs-only PRs are exempt.

A dashboard-visible change to `packages/contracts` (or `packages/observability`) only reaches
`lumi-dashboard` once it's published and re-pinned there:

1. Add a changeset: `bun run changeset`, bump type `patch`/`minor`/`major` for the changed package(s).
2. Merge to `main` — the Changesets workflow opens a `chore: version packages` PR; merging it
   publishes `@lumi-devs/contracts`/`@lumi-devs/observability` to npm automatically.
3. `lumi-dashboard` picks up `minor`/`patch` releases via its weekly dependabot group; a `major`
   needs a manual PR there (see compatibility below).

`apps/api` enforces compatibility at connection time (`CONTRACT_MISMATCH`): it uses npm-style
semver range resolution via `contractVersionsCompatible()`. Callers within `COMPATIBLE_CONTRACT_RANGE`
(`>=MIN_COMPATIBLE_CONTRACT_VERSION <=CONTRACT_VERSION`) are accepted, allowing older deployed
dashboard releases to talk to newer API releases without breaking. Only bump `MIN_COMPATIBLE_CONTRACT_VERSION`
when wire contracts introduce an incompatible breaking change.

**The two public packages are versioned and published in lockstep, not independently.**
`.changeset/config.json` declares them `linked`, so one changeset minor/major moves both together,
and the Changesets workflow publishes both in the same run. Private workspace packages are
versioned together too (`privatePackages.version`), but never published.

**Release channels**: prereleases go through the `next` dist-tag — `bunx changeset pre enter next`,
merge the resulting `Version Packages` PRs while prereleases are needed, then
`bunx changeset pre exit next` to return to `latest`. So:

- `0.7.1-next.0` → prerelease, installed only by `@lumi-devs/contracts@next` /
  an explicit version pin — never picked up by a bare `^0.7.0` or `latest` install.
- `0.7.1` → stable, published as `latest`.

Full reference: [Dashboard Guide](https://lumi-devs.github.io/Lumi-docs/guides/dashboard). System-level view: the
[Architecture doc site page](https://lumi-devs.github.io/Lumi-docs/reference/architecture).

## Repo-specific anti-patterns

- **Database access**: modules go through `container.db` (`DatabaseService`), never
  `container.prisma` directly. (The only legitimate direct `container.prisma` uses are
  client bootstrap in `packages/core/src/lib/client/LumiClient.ts`; addon code touching it
  is flagged by the addon validator as an error.)
- **Cache invalidation**: shared Valkey keys are invalidated via `container.invalidation`
  (`InvalidationBus`), never a raw `valkey.del`.
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
  (`tsc --noEmit -p tsconfig.json` in each).
- `bun run lint` — `turbo run lint:all`, a root-only turbo task (not a per-package fan-out)
  that runs the root's own `lint:all` script: `eslint packages/*/src packages/core/tests
  apps/*/src apps/*/tests`. Check-only, no `--fix` — this is what CI runs. For local
  auto-fixing, use `bun run lint:fix` (`turbo run lint:all:fix`, the same eslint invocation
  with `--fix`).
- `bun run test` — the offline suite: `bun test --parallel` at the root (globs `packages/**`
  per `bunfig.toml`'s `[test] root`, skipping `tests/integration/`), then `apps/api`'s and
  `apps/cli`'s own tests. `bun run test:integration` runs the real Postgres/Valkey suite (see
  [`agents/conventions/testing.md`](agents/conventions/testing.md)).
- `bun run db:generate` — regenerate the Prisma client after a schema change.
- `lumi` (`apps/cli`, run as `bun apps/cli/src/main.ts` or via the `lumi` bin) — `start
  <worker|api|scheduler|all>`, `migrate [status]`, `addon <create|validate>`, `module list`,
  `config`, `doctor [--json]`. A thin wrapper over the same code these bullets already describe - see
  the [CLI Reference](https://lumi-devs.github.io/Lumi-docs/reference/cli).

The dashboard (its own repo, `lumi-devs/lumi-dashboard`) has its own `typecheck`/`lint`/`test`
scripts, run there rather than from this repo.

## Testing conventions

Tests live alongside or under a `tests/` directory per package: `packages/core/tests/`
(mirrors `packages/core/src/lib/**`, including the former `event-bus`/`sharding` packages'
tests at `tests/lib/event-bus/` and `tests/lib/sharding/`), and `packages/observability/tests/`.
`packages/contracts` instead co-locates `*.test.ts` files next
to the source they cover (e.g. `packages/contracts/src/rpc/router.test.ts`). For
database-touching unit tests, `packages/core/tests/mocks/prisma.ts` provides an offline
in-memory mock Prisma driver so tests don't need a live Postgres instance.

`apps/api` has its own `tests/` directory (its own `bunfig.toml`, `root = "tests"`) and its own
`test` script, run separately from the root's package-scoped `bun test --parallel` (root
`bunfig.toml` sets `root = "packages"`) — the root `test`/`test:coverage` scripts chain into it
with `bun run --cwd apps/api test`, the same pattern the dashboard used before it moved out.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
