# Testing

> The dashboard lives in its own repo, [`lumi-devs/lumi-dashboard`](https://github.com/lumi-devs/lumi-dashboard).
> Its test suite lives and runs there — `bun run test` here never touches it.

Tests use `bun:test` (`describe`/`it`/`expect`/`vi` imported explicitly, no globals).
There is no vitest config anywhere in this repo. `bunfig.toml` sets the test
root to `packages`.

## Where tests live

- `packages/core/tests/` mirrors `packages/core/src/lib/` (e.g. `tests/lib/permissions/`,
  `tests/lib/event-bus/`, `tests/lib/sharding/`), plus `tests/core/` (framework: module
  loader, permits, i18n, RPC surface, addon validation, panels), `tests/modules/<name>/`
  (one folder per feature module), and `tests/mocks/` (the offline Prisma driver, with
  its own test for the mock itself).
- `packages/contracts` co-locates `*.test.ts` next to the source they cover
  (e.g. `packages/contracts/src/rpc/router.test.ts`, `client.test.ts`).
- `packages/observability/tests/`, `apps/api/tests/`, `apps/cli/tests/` — each app/package
  with its own suite. `apps/worker` has no suite (no established pattern for one yet).

Deciding where a new test goes: mirror the source path. Touched
`packages/core/src/lib/foo/bar.ts` → `packages/core/tests/lib/foo/bar.test.ts`;
touched `packages/core/src/modules/<x>/...` → `packages/core/tests/modules/<x>/`.

## Running tests

`bun run test` is `bun test --parallel --path-ignore-patterns
'**/tests/integration/**'` over `packages/**`, chained with `apps/api`'s and
`apps/cli`'s own suites. The `--path-ignore-patterns` flag keeps it fully
offline — nothing under any `tests/integration/` directory runs, so no live
Postgres or Valkey is needed.

## Real-service integration tests

`packages/core/tests/integration/` (5 files: `audit-keyset-pagination`,
`event-bus`, `idempotency`, `moderation-repository`, `scheduler-lock`, plus
`setup.ts`) exercises real Postgres and Valkey. Excluded from `bun run test`;
run via `bun run test:integration` (`bun test packages/*/tests/integration`).

`setup.ts` reads `LUMI_TEST_DATABASE_URL` / `LUMI_TEST_VALKEY_URL` — never the
app's own names — so a dev `.env` can't be picked up by accident. Each file
wraps its suite in `integrationDescribe`, which skips (with the reason in the
skip name) unless both vars are set.

Local run: start `postgres` + `valkey` from `docker-compose.yml`, create a
separate database (e.g. `lumi_test`), apply the schema with Prisma pointed at
it, and export the two vars on a non-default Valkey index. In CI the
`integration` job runs the same suite against service containers and feeds the
`ci-status` aggregator alongside the offline suite.

## The mock Prisma driver

`packages/core/tests/mocks/prisma.ts` is an offline, in-memory stand-in for
`@prisma/client` (documented in its own header). Each `prisma.<model>` access
lazily creates an in-memory table on first touch. `createMockPrismaClient`
(`mocks/prisma.ts:496`) is the entry point.

Supported: `findUnique` / `findFirst` / `findMany` / `count`, `create` /
`createMany`, `update` / `updateMany` / `upsert`, `delete` / `deleteMany`,
`$transaction` (array and callback forms). No relation loading, no
referential-integrity enforcement. It covers the query shapes under
`packages/core/src/lib/prisma/repositories/` — extend the mock when a new
repository method needs an operator it lacks, rather than reaching for live
Postgres.

Two usage patterns, both in real tests: construct + inject (`new
EconomyRepository(prisma as never, ...)`, `bankservice.test.ts`), or swap the
module with `vi.mock("@prisma/client", ...)` for code that constructs its own
client. Use it for repository/service tests; skip it for pure logic (duration
parsing, threshold math), which stubs `container` fields directly instead.

## Test-writing conventions actually in use

- `describe` blocks group by *behavior area*, not one-per-function.
- `it` descriptions are full behavior sentences, not `"works"`.
- Module-level `vi.mock(...)` for framework singletons, `vi.clearAllMocks()`
  in `beforeEach` where a clean slate matters.
- Fixture builders (`makeConfig(overrides = {})`) over repeated literals.
- Scope `vi.spyOn(Bun, "spawn")` in `beforeEach` + `vi.restoreAllMocks()` in
  `afterEach` — a leaked spawn mock breaks every later file that spawns real
  processes.
- The i18n key test (`packages/core/tests/core/i18n.test.ts`) is one-directional:
  keys on disk missing from `en-US` fail; locales missing keys are normal
  in-progress Crowdin work. See `i18n.md`.
