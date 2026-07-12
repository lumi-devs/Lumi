# Contributing to Lumi

Thank you for considering a contribution! This document explains how to get set up, what conventions to follow, and what the review process looks like.

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| [Bun](https://bun.sh) | 1.1+ | Runtime and package manager |
| PostgreSQL | 16+ | Local or Docker |
| Redis | 7+ | Local or Docker |
| RabbitMQ | 3.12+ | Local or Docker (only needed for gateway/worker split) |

The easiest way to get all dependencies running is via Docker:

```bash
docker compose up -d postgres redis rabbitmq
```

---

## Local Setup

```bash
# 1. Fork and clone
git clone https://github.com/lumi-devs/lumi.git && cd lumi

# 2. Install dependencies
bun install

# 3. Generate the Prisma client (required before typecheck/test)
bun run db:generate

# 4. Push the DB schema (dev only — use migrations in production)
bun run db:push

# 5. Copy and fill in your environment
cp .env.example .env
# Edit .env: set BOT_TOKEN and CLIENT_ID at minimum

# 6. Start the bot (monolith mode)
bun run dev
```

---

## Architecture

Before writing any code, read **[AGENTS.md](AGENTS.md)**. It is the single source of truth for:

- The monorepo layout and package boundaries
- The module system (`@DefineModule`, `BaseCommand`, `Service`, `ModuleListener`)
- Data access rules (`container.db` — never `container.prisma` directly)
- The card system (never raw embeds)
- Permission levels and i18n conventions

Violating these will result in a PR being sent back for revision.

---

## Running Checks

```bash
# Type-check the whole monorepo
bun run typecheck

# Lint (auto-fixes where possible)
bun run lint

# Run the full test suite
bun run test

# Run a single test file
bunx vitest run packages/core/tests/modules/afk/afk.test.ts
```

All three checks (`typecheck`, lint, tests) must pass before a PR will be reviewed.

---

## Commit Convention

Commits follow the [Conventional Commits](https://www.conventionalcommits.org/) spec:

```
<type>(<scope>): <short summary>
```

| Type | When to use |
|------|-------------|
| `feat` | New feature or command |
| `fix` | Bug fix |
| `refactor` | Code change with no functional effect |
| `docs` | Documentation only |
| `test` | Adding or fixing tests |
| `chore` | Build, CI, dependency updates |
| `perf` | Performance improvement |

**Examples:**
```
feat(mod): add /quarantine command with role-lock
fix(filter): prevent false positives on quoted URLs
docs(contributing): add commit convention section
```

---

## Pull Requests

1. Create a branch from `master`: `git checkout -b feat/my-feature`.
2. Make your changes, following all conventions in `AGENTS.md`.
3. Push and open a PR — the template will guide you through the checklist.
4. CI must be green (lint, typecheck, tests).
5. At least one maintainer review is required before merge.

### Key rules
- **No cross-module imports.** A module must never import from a sibling module. Shared code goes in `src/lib/`.
- **No raw embeds.** Use `makeInfoCard`, `makeSuccessCard`, `makeErrorCard`, `makeWarningCard`, `makeListCard`.
- **No `JSON.parse` in try/catch.** Use `tryParseJSON` from `@sapphire/utilities`.
- **No `.filter(Boolean)` on typed arrays.** Use `.filter(filterNullish)`.
- **All user-facing strings must be i18n'd** in all four locales: `en-US`, `de`, `es-ES`, `fr`.

---

## Adding a New Module

1. Create `src/modules/<name>/` with an `index.ts` that exports a class decorated with `@DefineModule`.
2. Add sub-directories as needed: `commands/`, `listeners/`, `interaction-handlers/`, `services/`, `scheduled-tasks/`.
3. Generate a manifest: `bun run modules:manifest`.
4. Add translations to `src/languages/<locale>/<name>.json` for all four locales.
5. Write tests in `packages/core/tests/modules/<name>/`.

---

## Questions?

Open a [Discussion](https://github.com/lumi-devs/lumi/discussions) or file an [Issue](https://github.com/lumi-devs/lumi/issues) with the `question` label.
