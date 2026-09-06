# Testing

## Where tests live

Every package that has tests puts them under its own `tests/` directory, mirroring
`src/` structure rather than interleaving `*.test.ts` next to source files (with one
exception noted below):

- `packages/core/tests/core/*.test.ts` — framework-level tests: module loader,
  permits, i18n, RPC HTTP surface, addon validation, panel builders. One file per
  concern (`permits.test.ts`, `i18n.test.ts`, `hub-panel.test.ts`, ...), plus a
  `core/commands/*.test.ts` subfolder for individual command tests
  (`help.test.ts`, `repo.test.ts`, `lumi.test.ts`, `download.test.ts`,
  `dashboard.test.ts`).
- `packages/core/tests/modules/<module>/*.test.ts` — one subfolder per feature
  module, e.g. `modules/mod/actions.test.ts`, `modules/afk/afk.test.ts`,
  `modules/filter/heat.test.ts`. Dashboard RPC handlers for each module live under
  `modules/dashboard/<module>-rpc.test.ts` (`moderation-rpc.test.ts`,
  `guild-blocklist-rpc.test.ts`, `system-shards-rpc.test.ts`, etc.) rather than
  inside the module's own test folder — RPC surface is grouped by "dashboard"
  concern, not by the module the data belongs to.
- `packages/core/tests/mocks/` — shared test doubles (`prisma.ts`, and its own
  `prisma.test.ts` that tests the mock itself).
- `packages/event-bus/tests/*.spec.ts` — note the `.spec.ts` suffix here, not
  `.test.ts` (`factory.spec.ts`, `RedisStreamsBus.spec.ts`). The root vitest
  config's `include` globs both extensions (`vitest.config.ts:9`), so either works,
  but match what the package already uses — event-bus is the one outlier on
  `.spec.ts`.
- `packages/sharding/tests/shard-telemetry.test.ts`,
  `packages/observability/tests/observability.test.ts` — one file per package,
  small surface area.
- `apps/dashboard/tests/components/*.test.tsx` for React component tests,
  `apps/dashboard/tests/lib/*.test.ts` for plain TS (`rpc.ts`, `auth-guards.ts`,
  `proxy.ts`, `client-ip.ts`, `guild-routes.ts`, `setup-issues.ts`,
  `config-labels.ts`, `log-format.ts`). Same split as `src/components` vs `src/lib`.

Deciding where a new test goes: if you touched `packages/core/src/modules/<x>/...`,
the test goes in `packages/core/tests/modules/<x>/`. If you touched
`packages/core/src/lib/...`, it goes in `packages/core/tests/core/` (lib-level
behavior is tested through the `core/` folder, not a separate `lib/` mirror — there
is no `packages/core/tests/lib/`). If you touched `apps/dashboard/src/components/`
or `apps/dashboard/src/lib/`, mirror into `apps/dashboard/tests/components/` or
`apps/dashboard/tests/lib/` respectively.

## Running tests

`bun run test` is `vitest run && bun run --cwd apps/dashboard test` — two separate
Vitest invocations, not one shared run. The dashboard has its own `vitest` script
(`apps/dashboard/package.json:14`, plain `vitest run`) and its own
`vitest.config.ts` (`apps/dashboard/vitest.config.ts`), because it needs things the
root config doesn't:

- A `#` alias resolving to `apps/dashboard/src` — deliberately *not* registered in
  the shared root config, because a bare `"#"` prefix-alias there would collide
  with `packages/core`'s `#lib/*`, `#utilities/*` etc. subpath imports
  (`apps/dashboard/vitest.config.ts:4-16`, comment explains the collision risk).
- `oxc: { jsx: { runtime: "automatic" } }` — Vite's oxc transformer reads
  `apps/dashboard/tsconfig.json`'s `"jsx": "preserve"` (needed for `next build`)
  which otherwise leaves JSX untransformed under Vitest
  (`apps/dashboard/vitest.config.ts:23-31`).
- `environment: "node"` at the config level, same as root — but individual
  component test files that render React opt into `jsdom` per-file with a
  `// @vitest-environment jsdom` pragma comment on line 1 (every file under
  `apps/dashboard/tests/components/*.test.tsx` does this, e.g.
  `guild-picker.test.tsx:1`, `anti-nuke-card.test.tsx:1`). Plain-TS tests in
  `tests/lib/` don't need it.
- `setupFiles: ["./tests/setup.ts"]` — mocks the `server-only` package (which
  throws outside Next's `react-server` condition), wires React Testing Library's
  `cleanup()` into `afterEach` since `test.globals` isn't turned on, and stubs
  `IntersectionObserver`/`ResizeObserver` for `jsdom`
  (`apps/dashboard/tests/setup.ts`).

Root `vitest.config.ts` (repo root) is minimal: `environment: "node"`,
`include: ['packages/**/*.test.ts', 'packages/**/*.spec.ts']`, `tsconfigPaths: true`
for resolving `#lib/*.js` etc. It only globs `packages/**` — `apps/worker` has no
test suite of its own currently (worth flagging if you're about to write one: there
is no established pattern for it yet).

`bun run test:coverage` runs both suites with `--coverage` and both report to a
shared `coverage/` tree — the dashboard's `vitest.config.ts` explicitly points its
`reportsDirectory` at `../../coverage/dashboard` instead of the default
`apps/dashboard/coverage`, specifically so `bun run test:coverage`'s single
`coverage/` output covers both invocations (`apps/dashboard/vitest.config.ts:39-44`).

## The mock Prisma driver

`packages/core/tests/mocks/prisma.ts` is an offline, in-memory stand-in for
`@prisma/client`, documented in its own file header. It's schema-agnostic — it
doesn't read `prisma/schema.prisma` or hardcode model names. Each
`prisma.<model>` access lazily creates its own in-memory table (a plain array) the
first time it's touched, via a `Proxy` (`withModelProxy`,
`packages/core/tests/mocks/prisma.ts:440-452`).

Supported: `findUnique` / `findFirst` / `findMany` / `count`, `create` /
`createMany`, `update` / `updateMany` / `upsert`, `delete` / `deleteMany`,
`$transaction` (both array form and interactive-callback form). `where` supports
equality, `equals`/`not`/`in`/`notIn`/`lt(e)`/`gt(e)`/`contains`/`startsWith`/
`endsWith`, `AND`/`OR`/`NOT`, and flattened compound keys (e.g.
`where: { userId_guildId: { userId, guildId } }` for a `@@id([userId, guildId])`
model). `update`'s `data` supports plain field assignment plus the numeric
`{ increment | decrement | multiply | divide | set }` operators.

What it deliberately does not do: no relation loading (`include` returns the flat
record unchanged — seed already-joined shapes yourself if a test needs one), no
referential-integrity or cascade-delete enforcement. It covers exactly the query
shapes the real repositories under `packages/core/src/lib/prisma/repositories/*.ts`
actually use; if a new repository method needs a filter operator that isn't listed
above, extend `applyOperator`/`matches` in the mock rather than reaching for a real
Postgres instance.

Two ways to use it, both documented in the file header and both seen in real
tests:

1. **Construct directly and inject** — the common path for repository/service unit
   tests, seen in `packages/core/tests/modules/economy/bankservice.test.ts:50-60`:
   ```ts
   let prisma: ReturnType<typeof createMockPrismaClient>;
   beforeEach(() => {
     prisma = createMockPrismaClient();
     repo = new EconomyRepository(prisma as never, {} as never, mockLogger, mockDb);
   });
   ```
2. **Swap the whole module** with `vi.mock("@prisma/client", () => ({ PrismaClient:
   vi.fn(() => mockClient) }))` — for code paths that construct their own
   `PrismaClient` internally rather than accepting one as a constructor arg.

Use the mock whenever a test exercises a repository or a service that holds a
repository. Don't reach for it when the code under test doesn't touch
`container.prisma`/`container.db` at all — most module logic (duration parsing,
threshold math, action classes) mocks `@sapphire/framework`'s `container` wholesale
instead (see `packages/core/tests/modules/mod/actions.test.ts:22-74`, which mocks
`container.redis`, `container.db.moderation`, `container.tasks`, `container.client`
as plain `vi.fn()` stubs) — there's no Postgres-shaped data involved, so the Prisma
mock would be overhead for no benefit.

## Test-writing conventions actually in use

- `describe`/`it` from `vitest`, not `test`. Every file surveyed
  (`actions.test.ts`, `bankservice.test.ts`, `i18n.test.ts`,
  `guild-picker.test.tsx`) imports `{ describe, it, expect, vi, beforeEach }` (or
  the subset it needs) from `"vitest"` explicitly — no global `describe`/`it`,
  matching `test.globals` being unset in both configs.
- `describe` blocks are grouped by *behavior area*, not one-per-function:
  `describe('Mod Helpers & Duration Parsing', ...)` and
  `describe('Mod Thresholds Logic', ...)` both live in the same
  `actions.test.ts` file (`packages/core/tests/modules/mod/actions.test.ts:87,113`).
- `it` descriptions are full sentences describing behavior, not `"works"` or
  `"test 1"`: `'formatDuration converts ms into human readable string'`,
  `'checkThresholds logs instead of throwing when quarantine is unconfigured'`.
- Module-level `vi.mock(...)` calls at the top of the file for framework
  singletons (`@sapphire/framework`'s `container`, `#lib/schedule-task.js`), with
  `vi.clearAllMocks()` in a `beforeEach` when a `describe` block needs a clean
  slate between assertions (`actions.test.ts:114-116`).
- Fixture builder functions (`makeConfig(overrides = {})`) instead of repeating a
  full object literal in every test — `bankservice.test.ts:15-40`.
- Component tests use React Testing Library's `render`/`screen`, query by
  accessible role and name (`screen.getByRole("link", { name: /Open dashboard/ })`)
  over test IDs or class selectors (`guild-picker.test.tsx:36`).
- The i18n key-parity test (`packages/core/tests/core/i18n.test.ts:99-111`) is the
  one enforcement test that reads real JSON files off disk rather than mocking
  anything — see `i18n.md` for what it checks.
