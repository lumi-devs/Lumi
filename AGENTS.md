# Ember — OpenCode Agent Guide

## Runtime

**Bun, not Node.** All commands use `bun` (not `npx`, `node`, `npm`). Bun runs TS natively — no compile step.

| Command | Purpose |
|---|---|
| `bun run dev` | Dev server with hot-reload (also does `rm -rf node_modules/.bin && bun install` first) |
| `bun run start` | Production (bun src/main.ts) |
| `bun run test` | `vitest run` |
| `bun run typecheck` | `tsc --noEmit -p src/tsconfig.json` |
| `bun run lint` | `eslint src --ext ts --fix` |
| `bun run db:generate` | `prisma generate` |
| `bun run db:migrate` | `prisma migrate dev` |

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

1. **Never `new EmbedBuilder()`** — all UI goes through `src/utilities/cards.ts` factories (makeSuccessCard, makeErrorCard, etc.)
2. **Never hard-code Redis keys** — always use `RedisKeys.*` from `src/database/redis.ts`
3. **Never `awaitMessageComponent()`** — use an `InteractionHandler` piece instead
4. **Throw errors, never send them** — global error listeners catch typed errors and render error cards automatically
5. **Slash commands in groups** — `/foo bar`, never `/foo_bar`. Prefix commands reserved for owner/admin tooling only.
6. **No cross-module imports** — `raids/` must not import from `afk/`. Enforced by ESLint `no-restricted-imports`.
7. **Modules are self-contained** — each module owns its own data access in `src/modules/<name>/data.ts`. Never add module-specific methods to `DatabaseService`. Modules access `container.prisma` and `container.redis` directly for their own data.
8. **Module-specific utilities stay in the module** — never pollute `src/utilities/` with module-specific logic (e.g., `sanitizeReason` belongs in the AFK module, not in `formatting.ts`).

## Database

- Access Prisma via `container.prisma` (e.g., `import { container } from '@sapphire/framework'`)
- Snowflakes stored as `String` (`@db.VarChar(20)`), not BigInt
- Prisma schema: `prisma/schema.prisma`

## Module system

- Modules extend `Module` base class from `src/core/module-system/Module.ts` with `@EmberModule()` decorator
- Each module must implement `deleteUserData(userId, requester)` for GDPR
- `RequesterType.USER_STRICT` / `DISCORD_DELETED_USER` = purge; `USER` may keep audit records
- Moderation cases are **anonymized** (userId → `'0'`), never deleted
- Module-specific data access lives in `src/modules/<name>/data.ts` — modules interact with their own database tables and Redis keys directly through `container.prisma` and `container.redis`. Never route module data through `DatabaseService`.

## Key structural facts

- Entrypoint: `src/main.ts` — connects DB → RPC bridge → client.login()
- Core (non-removable) lives in `src/core/`; feature modules in `src/modules/`
- `src/client/setup.ts` — Sapphire plugin registration (order matters)
- Container augments in `src/core/types/common.ts`: `prisma`, `redis`, `workers`, `invalidation`, `moduleStore`, `rabbit`, `stats`
- Background CPU work uses Bun Worker thread pool via `src/workers/WorkerManager.ts`

## CI (must pass before merge)

1. `bun run lint`
2. `bun run typecheck`

## Reference files

- `.skills/ember-sapphire-framework.md` — Sapphire pieces, decorators, subcommands
- `.skills/ember-wizard.md` — Architect-mode planning, TDD, quality gates, Ember patterns
