# Testing

Runner: Vitest via `bun run test` (`vitest run`). Run one file with
`bunx vitest run <path>`.

## Layout

- Package tests next to the package: `packages/<name>/tests/`.
- Cross-cutting tests: `tests/`.
- Use temporary directories for filesystem/downloader tests; remove them in
  `afterAll`.
- Never hit Discord. Never require a real token.

## Cache tests

Use a test-local in-memory fake that implements `CacheRedis` (see
`packages/cache/tests/cache.test.ts`) and a fake `InvalidationPort`. Cover:

- L1 hit and Redis hit
- negative caching overwrites on positive write
- single-flight
- invalidation during a load (no stale write)
- TTL jitter stays within bounds
- LRU eviction
- Date/BigInt round-trip

## DB tests

Repository logic should be testable without a live server. Integration tests are
gated on `TEST_DATABASE_URL`; skip when absent. When present:

1. `bunx prisma migrate deploy` against the test database.
2. Seed only the rows the test owns.
3. Clean up by unique guild IDs.

Never assert on the global process state; services are constructed per test.

## Module tests

Build fixture roots with `mkdtemp`, write `manifest.json` + entry files, and drive
`ModuleLoader` with a fake `LumiServices`. Cover:

- dependency ordering
- missing dependency warning (the module still loads)
- unsatisfied version range skips the module
- command and listener ownership, reserved command collisions, builder mismatches
- disabled module not loaded
- reload unloads listeners/commands first

## Downloader tests

- Installer: use a local directory source in a temp root with a fake module
  loader; never reach the network in unit tests.
- Manifest handling: missing file, invalid JSON, and conflict detection.
- Requirement filtering: non-registry specs are skipped; a live `bun add` check
  is manual or gated.
