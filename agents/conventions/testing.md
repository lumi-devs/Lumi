# Testing

> The dashboard now lives in its own repo, [`lumi-devs/lumi-dashboard`](https://github.com/lumi-devs/lumi-dashboard).
> Paths below that used to be `apps/dashboard/...` in this repo are now repo-root-relative
> there; `bun run test` in this repo no longer runs the dashboard's test suite.

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
  `.test.ts` (`factory.spec.ts`, `StreamBus.spec.ts`). The root vitest
  config's `include` globs both extensions (`vitest.config.ts:9`), so either works,
  but match what the package already uses — event-bus is the one outlier on
  `.spec.ts`.
- `packages/sharding/tests/shard-telemetry.test.ts`,
  `packages/observability/tests/observability.test.ts` — one file per package,
  small surface area.
- The dashboard's own `tests/components/*.test.tsx` and `tests/lib/*.test.ts` now live in
  the `lumi-dashboard` repo, with their own testing conventions — not covered here.

Deciding where a new test goes: if you touched `packages/core/src/modules/<x>/...`,
the test goes in `packages/core/tests/modules/<x>/`. If you touched
`packages/core/src/lib/...`, it goes in `packages/core/tests/core/` (lib-level
behavior is tested through the `core/` folder, not a separate `lib/` mirror — there
is no `packages/core/tests/lib/`).

## Running tests

`bun run test` in this repo is `bun test --parallel --path-ignore-patterns
'**/tests/integration/**'`, globbing `packages/**` — it no longer runs the dashboard's own
test suite, which lives and runs in the `lumi-dashboard` repo. `apps/worker` has no test
suite of its own currently (worth flagging if you're about to write one: there is no
established pattern for it yet). The `--path-ignore-patterns` flag keeps this suite fully
offline: every file under a package's `tests/integration/` directory is excluded, so this
command never needs a running Postgres or Valkey. See the next section for that suite.

## Real-service integration tests

`packages/core/tests/integration/` holds tests that exercise real Postgres and Valkey rather
than the offline mock Prisma driver or a mocked `container.valkey` — currently
`withIdempotency` (`idempotency.test.ts`), the scheduler lease/generic Valkey lock
(`scheduler-lock.test.ts`), the Valkey Streams event bus's publish/consume/ack path
(`event-bus.test.ts`), and a Prisma round-trip through `ModerationRepository`
(`moderation-repository.test.ts`). These are excluded from `bun run test` and instead run via
`bun run test:integration` (`bun test packages/*/tests/integration`), a separate root script.

**Env vars, deliberately not the app's own names.** `packages/core/tests/integration/setup.ts`
reads `LUMI_TEST_DATABASE_URL` and `LUMI_TEST_VALKEY_URL` — never `DATABASE_URL`,
`POSTGRES_URL`/`DIRECT_POSTGRES_URL`, or `VALKEY_HOST`/`VALKEY_PASSWORD` — so a developer's own
`.env` (pointed at a real dev/prod database) can never be picked up here by accident. Every
test file wraps its `describe` block in `integrationDescribe` from `setup.ts`, which calls
through to a real `describe` when both vars are set and to `describe.skip` (with the missing-env
reason baked into the skip name) otherwise — so `bun run test:integration` with the vars unset
exits 0 having skipped everything, both locally and if the CI job's services ever fail to come
up.

**Running it locally**: start the Postgres/Valkey containers from `docker-compose.yml` yourself
(`docker compose up -d postgres valkey` or equivalent — do **not** point these tests at your
main dev database or dev Valkey DB index). Create a separate database for it (e.g. `lumi_test`,
via `docker compose exec postgres createdb -U lumi lumi_test`), apply the schema to it with
Prisma pointed at that database (`POSTGRES_URL=postgresql://lumi:lumi@localhost:5432/lumi_test
bunx prisma migrate deploy`), then export:

```sh
export LUMI_TEST_DATABASE_URL=postgresql://lumi:lumi@localhost:5432/lumi_test
export LUMI_TEST_VALKEY_URL=valkey://:lumi@localhost:6379/1
bun run test:integration
```

Use a Valkey DB index other than `0` (the app's own default) in `LUMI_TEST_VALKEY_URL` — the
suite only ever `SCAN`s and deletes its own key prefixes (`lumi:rpc:idem:`,
`lumi:test:int:*`) or exact known keys (`lumi:scheduler:leader`) it created itself, and never
issues `FLUSHALL`/`FLUSHDB`, but a dedicated index keeps it fully isolated from anything else
sharing that Valkey regardless. The Prisma test similarly only ever deletes the exact `Guild`
rows (and, via `onDelete: Cascade`, their `ModerationCase`/`GuildCaseCounter` rows) it created,
keyed on randomly generated guild ids — never a table-wide delete.

**In CI**, the `integration` job in `.github/workflows/ci.yml` runs this suite against GitHub
Actions service containers (`postgres:18-alpine`, `valkey/valkey:8-alpine` — matching
`docker-compose.yml`'s major versions), applying `bunx prisma migrate deploy` against the
service Postgres before running `bun run test:integration` with `LUMI_TEST_DATABASE_URL`/
`LUMI_TEST_VALKEY_URL` pointed at the services. It's a separate job from `test` (the offline
suite) and is included in the `ci-status` aggregator's required job list.

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
`container.valkey`, `container.db.moderation`, `container.tasks`, `container.client`
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
