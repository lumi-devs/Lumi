# Ember — OpenCode Agent Guide

## Runtime

**Bun, not Node.** All commands use `bun` (not `npx`, `node`, `npm`). Bun runs TS natively — no compile step.

| Command | Purpose |
|---|---|
| `bun run dev` | `bun install && db:generate`, then runs `@ember/worker` with hot-reload |
| `bun run start` | Production — `bun --filter @ember/worker run start` |
| `bun run test` | `vitest run` (the canonical runner — **not** `bun test`, which is Bun's own) |
| `bun run typecheck` | `tsc --noEmit -p tsconfig.json` |
| `bun run lint` | `eslint packages/*/src apps/*/src --ext ts --fix` (note: adds `--fix`) |
| `bun run db:generate` / `db:push` / `db:migrate` | `prisma generate` / `db push` / `migrate dev` |
| `bun run modules:manifest` | Regenerate module manifests (`scripts/generate-manifests.ts`) |

## Guiding Principles

### 1. Think Before Coding
State assumptions explicitly. If uncertain, ask. If multiple interpretations exist, present them — don't pick silently. If a simpler approach exists, say so. If something is unclear, stop and name what's confusing.

### 2. Simplicity First
Minimum code that solves the problem — nothing speculative. No features beyond what was asked. No abstractions for single-use code. No "flexibility" that wasn't requested. If you write 200 lines and it could be 50, rewrite it.

### 3. Surgical Changes
Touch only what you must. Don't "improve" adjacent code, comments, or formatting. Don't refactor things that aren't broken. Match existing style. If you notice unrelated dead code, mention it — don't delete it. When your changes create orphans (unused imports, variables), remove those only.

### 4. Goal-Driven Execution
Transform tasks into verifiable goals: "Add validation" → "Write tests for invalid inputs, then make them pass." For multi-step tasks, state a brief plan with verification checkpoints. Strong success criteria let you iterate independently.

## Non-negotiable conventions

1. **Never `new EmbedBuilder()`** — all UI goes through `packages/core/src/utilities/cards.ts` factories (makeSuccessCard, makeErrorCard, etc.)
2. **Never hard-code Redis keys** — always use `RedisKeys.*` from `packages/core/src/database/redis.ts`
3. **Never `awaitMessageComponent()`** — use an `InteractionHandler` piece instead
4. **Throw errors, never send them** — global error listeners catch typed errors and render error cards automatically
5. **Slash commands in groups** — `/foo bar`, never `/foo_bar`. Prefix commands reserved for owner/admin tooling only.
6. **No cross-module imports** — `raids/` must not import from `afk/`. Enforced by ESLint `no-restricted-imports`.
7. **Modules use the sanctioned data layer** — feature persistence goes through **`container.db`** (`DatabaseService`), **never** `container.prisma` directly. Per-module helpers live in `packages/core/src/modules/<name>/data.ts` and wrap `container.db` (generic KV: `container.db.guildKV.getModuleData`/`setModuleData`; config: `container.db.config`) plus `container.redis` for module-owned `RedisKeys`.
8. **Module-specific utilities stay in the module** — never pollute `packages/core/src/utilities/` with module-specific logic (e.g., `sanitizeReason` belongs in the AFK module, not in a shared utility).

## Database

- Feature persistence → **`container.db`** (`DatabaseService`; wraps Prisma + Redis cache-aside). `container.prisma` is the raw client it's built on — **don't call it from a module.**
- Snowflakes stored as `String` (`@db.VarChar(20)`), not BigInt
- Prisma schema: `prisma/schema.prisma`

## Module system

- Modules extend `Module` base class from `packages/core/src/core/module-system/Module.ts` with `@EmberModule()` decorator
- Each module must implement `deleteUserData(userId, requester)` for GDPR
- `RequesterType.USER_STRICT` / `DISCORD_DELETED_USER` = purge; `USER` may keep audit records
- Moderation cases are **anonymized** (userId → `'0'`), never deleted
- Module data-access helpers live in `packages/core/src/modules/<name>/data.ts` — they wrap **`container.db`** (+ `container.redis` for module-owned keys), **not** `container.prisma`.

## Key structural facts

- **Monorepo** — Bun workspaces: `packages/*` (libraries; the bot is `@ember/core` at `packages/core/`) + `apps/*` (deployment entrypoints `@ember/{gateway,worker,scheduler,api}`). The `src/…` paths below sit under `packages/core/src/`.
- Entrypoint: `apps/worker/src/main.ts` — telemetry → `@ember/core/setup` → `EmberClient.bootstrap()` (role from `EMBER_ROLE`, `monolith` default). Split roles run from `apps/{gateway,scheduler,api}`; see CLAUDE.md _Runtime roles & scale-out_.
- Core (non-removable) lives in `packages/core/src/core/`; feature modules in `packages/core/src/modules/`
- `packages/core/src/client/setup.ts` — Sapphire plugin registration (order matters)
- Container augments in `packages/core/src/core/types/common.ts`: `prisma`, `redis`, `db` (DatabaseService — use this, not `prisma`), `invalidation`, `moduleStore`, `modules`, `workers`, `entityCache`, `tasks`, `configChangeHooks`, `rabbit?`, `stats`
- Background CPU work uses the Worker thread pool via `packages/core/src/workers/WorkerManager.ts` (lazy-spawn)

## CI (must pass before merge)

1. `bun run lint`
2. `bun run typecheck`

## Reference files

- `.skills/ember-sapphire-framework.md` — Sapphire pieces, decorators, subcommands
- `.skills/ember-wizard.md` — Architect-mode planning, TDD, quality gates, Ember patterns
