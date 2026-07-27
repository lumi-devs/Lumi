# Project: Lumi Maintenance & Governance Optimization

## Architecture
Monorepo built on Bun + Sapphire Framework v5 + Discord.js v14.
- `packages/` (`@lumi/core`, `@lumi/event-bus`, `@lumi/observability`, `@lumi/contracts`, `@lumi/sharding`, `@lumi/sdk`)
- `apps/` (`@lumi/dashboard`, `@lumi/gateway`, `@lumi/scheduler`, `@lumi/worker`)

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Codebase Deduplication & Cleanup (R1) | Scan root, `packages/*`, `apps/*` for dead code, duplicate configs, obsolete files; consolidate cleanly without breaking imports | None | DONE |
| M2 | Documentation Fact-Checking & Alignment (R2) | Audit `README.md`, `AGENTS.md`, doc guides against code implementations (transports like RabbitMQ/inproc/streams vs NATS, BullMQ, entityCache, etc.) and correct inaccuracies | M1 | DONE |
| M3 | Open Standards Benchmark Alignment (R3) | Benchmark documentation layout/structure against Red-DiscordBot & Skyra open standards via lightweight inspection; rewrite docs to open standards | M2 | DONE |
| M4 | Verification & PR Creation (R4) | Execute deferred verification (`bun run lint`, `bun test`) and create PR via `gh pr create` with detailed change summary | M3 | IN_PROGRESS |

## Interface Contracts & Guardrails
- Deferred Verification: `bun test` and `bun run lint` must NOT be executed prior to Milestone 4 to conserve tokens and system resources.
- Code Safety: No breaking changes to `@lumi/*` package exports or inter-package dependencies. Always append `.js` extension to internal package specifiers.
- Fact-Checking Rigor: All claims in `README.md`, `AGENTS.md`, and guides must reflect actual code status (e.g. transport support, entityCache usage flags, scheduled task engines).
