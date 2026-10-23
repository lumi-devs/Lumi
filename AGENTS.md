# AGENTS.md

Operating spec for agents working in this repository.

Lumi v2 is a Bun-workspace monorepo for a self-hosted Discord bot. The product's
centrepiece is the **module loader and addon downloader**; caching and database
access exist to keep that hot path fast and correct.

## Read first

1. `agents/00-index.md`
2. The doc for the area you are changing.

The `agents/` directory is the source of truth for how this codebase works. If
your change alters a documented contract, update the matching doc in the same
change. If you add a new subsystem, add a new `agents/<area>.md` and link it from
`agents/00-index.md`. If you delete a subsystem, delete its doc and its index
entry.

## Non-negotiables

- Every module is toggleable. There is no privileged "core" module and no
  `essential`/`disableable` escape hatch. Always-on behaviour lives in
  `apps/bot/src/` as built-in listeners/commands, not as a module.
- Modules are discovered from `manifest.json` and loaded from an explicit entry
  file. No hidden global registries, no side-effect imports.
- Built-in commands have `module: null` and always run. Module commands only run
  when that module is enabled for the guild.
- Addons are untrusted. Install with validation, path checks, and atomic
  switches. Never let an addon import bot internals (`@lumi/db`, `@lumi/redis`,
  `@lumi/cache`, `@lumi/modules`, `@lumi/downloader`). Addons are not sandboxed.
  Addon npm dependencies live in `manifest.json` `requirements` and are installed
  with `bun install --production --ignore-scripts --no-save`; registry semver
  ranges only.
- The database is Postgres via Prisma with versioned migrations. Do not copy
  Redbot's idempotent-DDL approach.
- Redis is a single endpoint. No Cluster/Sentinel code paths. Multi-replica
  correctness comes from exact-key invalidation over pub/sub.
- Every cache read has an explicit namespace. Never derive a metrics label from
  a key segment.
- UI is the card system in `@lumi/ui`. Do not introduce `EmbedBuilder`.
- No compatibility shims. Change the caller.

## Verification

Run through the nix shell:

```sh
nix develop --command bun run typecheck
nix develop --command bun test
```

Database-backed checks need Postgres and Redis; see `agents/testing.md`.
