# Contributing to Lumi

Thank you for your interest in contributing to Lumi! This guide provides complete instructions for setting up your local environment, adhering to project architecture standards, submitting Pull Requests, and verifying your changes.

> [!IMPORTANT]
> Before writing code, review **[AGENTS.md](AGENTS.md)**. It serves as the single source of truth for repository layout, architectural boundaries, module contracts, and UI card standards.

---

## Toolchain & Prerequisites

Ensure the following prerequisites are installed on your workstation:

| Dependency | Minimum Version | Recommended Installation | Notes |
| :--- | :--- | :--- | :--- |
| **[Bun](https://bun.sh)** | `1.3.0+` | <code>curl -fsSL https://bun.sh/install &#124; bash</code> | Primary JavaScript runtime, package manager, and test runner |
| **Node.js** | `26.0.0+` | `nvm install 26` | Required for tooling compatibility and typechecking |
| **PostgreSQL** | `17.0+` | Docker / Native | Relational database (uses PgBouncer connection pooler) |
| **Redis** | `7.0+` | Docker / Native | High-speed cache, rate limiting, and Redis Streams event bus |
| **RabbitMQ** | `4.0+` | Docker / Native | Inter-service message broker (Gateway / Worker decoupled scale profile) |
| **Nix** | Optional | [Nix Package Manager](https://nixos.org) | Declarative shell environment via `nix-shell` |

---

## Local Environment Setup

### 1. Repository Setup

Clone the repository and install dependencies:

```bash
git clone https://github.com/lumi-devs/lumi.git
cd lumi

# Install workspace dependencies using Bun
bun install

# Alternatively, if using Nix:
nix-shell -p bun nodejs --run "bun install"
```

### 2. Infrastructure Backends (Docker Compose)

Start PostgreSQL, PgBouncer, Redis, and RabbitMQ containerized services:

```bash
docker compose up -d postgres pgbouncer redis rabbitmq
```

### 3. Database Schema Provisioning

Generate the Prisma Client types and synchronize the schema to your development database:

```bash
# Generate Prisma Client code
bun run db:generate

# Push schema directly to dev database (for local development)
bun run db:push

# For production-style migration workflows:
bun run db:migrate
```

### 4. Environment Configuration (`.env`)

Copy `.env.example` to `.env` and fill in required secrets:

```bash
cp .env.example .env
```

### 5. Launch Development Server

Start Lumi in monolithic development mode:

```bash
bun run dev
```

---

## Changesets & Changelog Workflow

Lumi uses **[Changesets](https://github.com/changesets/changesets)** to automate package versioning and release notes across our workspace packages (`@lumi/core`, `@lumi/gateway`, `@lumi/worker`, etc.).

### When to Add a Changeset

If your PR introduces a feature, bug fix, refactor, or performance improvement in `packages/` or `apps/`, you **must** include a changeset file.

### How to Create a Changeset

1. Run the interactive CLI helper:
   ```bash
   bun changeset
   ```
2. Select the package(s) affected by your changes using spacebar.
3. Select the bump level (`patch` for bug fixes/minor tweaks, `minor` for new features, `major` for breaking API changes).
4. Enter a clear summary of your change for the release notes.
5. Commit the generated markdown file inside `.changeset/` as part of your pull request.

> [!NOTE]
> PRs that only modify documentation, CI scripts, or workspace dependencies (`area:docs`, `area:ci`, `area:deps`, `docs-only`) are exempt from the changeset requirement.

---

## Code Standards & Architectural Rules

To maintain high software quality across the monorepo, all contributions must strictly conform to these core development rules:

> [!WARNING]
> PRs that violate module boundaries or data layer abstractions will be requested to make architectural revisions before code review.

### 1. Module Isolation Boundary

Modules inside `packages/core/src/modules/` **must never** import code directly from sibling modules.

```ts
// ❌ Disallowed: Cross-module direct import
import { MuteService } from "../moderation/services/MuteService.js";

// ✅ Allowed: Inter-module communication via global EventBus or shared Services
import { container } from "@sapphire/framework";
const eventBus = container.stores.get("services").get("event-bus");
```

### 2. Data Access Layer Abstraction

Never use `container.prisma` directly inside commands or modules. Always route database operations through `container.db` (the repository abstraction layer).

```ts
// ❌ Disallowed
const guild = await container.prisma.guild.findUnique({ where: { id: guildId } });

// ✅ Allowed
const guild = await container.db.guilds.get(guildId);
```

### 3. Card UI System (`@lumi/ui-cards`)

Raw Discord embeds (`EmbedBuilder`) are strictly prohibited in user-facing command responses. Always construct UI responses using Lumi's standardized card primitives:

```ts
import { makeSuccessCard, makeErrorCard } from "#utilities/cards.js";
import { replySuccess } from "#lib/commands.js";

// Respond with standardized success feedback
await replySuccess(interaction, "Settings Saved", "Updated moderation threshold.");
```

### 4. Code Hygiene & Utility Functions

* **JSON Parsing**: Never place raw `JSON.parse()` calls inside generic `try/catch` blocks. Use `tryParseJSON` from `@sapphire/utilities`.
* **Array Filtering**: Do not filter typed arrays using `.filter(Boolean)`. Use `.filter(filterNullish)` from `@sapphire/utilities`.
* **Configuration Validation**: All module configurations must define a strict schema using `@sapphire/shapeshift` `cfg.*` helpers inside `@DefineModule`.

### 5. Internationalization (i18n)

All user-facing strings must be localized using Sapphire's `@sapphire/plugin-i18next`. Every command string key must exist in `en-US` at minimum; translations for other locales are sourced via Crowdin. 30 Discord locales are supported (from `af-ZA` to `zh-TW`), falling back to `en-US` for untranslated strings.

Translation files reside in `packages/core/src/languages/<locale>/`.

---

## Verification & Testing Suite

Run the full verification suite locally prior to pushing your branch:

```bash
# 1. Monorepo TypeScript compilation check
bun run typecheck

# 2. ESLint linting with auto-fixes
bun run lint

# 3. Unit and integration tests (Vitest)
bun run test

# 4. End-to-end black-box tests
bun run test:e2e

# 5. Fault tolerance & event bus resilience verification
bun run verify:resilience
```

| Verification Command | Execution Tool | Target / Description |
| :--- | :--- | :--- |
| `bun run typecheck` | `tsc` | Monorepo-wide type checking without emitting files |
| `bun run lint` | `eslint` | Code style enforcement and linting auto-fixes |
| `bun run test` | `vitest` | Fast unit and integration tests across packages |
| `bun run test:e2e` | `vitest` | Black-box E2E tests executing full bot flows |
| `bun run verify:resilience` | Bun TS | Redis Streams event bus fault tolerance test suite |

---

## Commit & PR Conventions

### Git Commit Guidelines

Lumi follows standard commit conventions:

```text
<type>(<scope>): <short description>
```

#### Commit Types

| Type | Purpose | Example |
| :--- | :--- | :--- |
| `feat` | New feature or command | `feat(moderation): add /quarantine command` |
| `fix` | Bug fix | `fix(gateway): resolve heartbeat timeout reconnect loop` |
| `refactor` | Code change that neither fixes a bug nor adds a feature | `refactor(db): optimize guild query caching` |
| `docs` | Documentation updates | `docs(config): document tempo tracing pipeline` |
| `test` | Adding or updating tests | `test(resilience): add event-bus burst test` |
| `chore` | Build tasks, package management, dependencies | `chore(deps): update sapphire framework packages` |
| `perf` | Code changes that improve performance | `perf(event-bus): reduce stream consumer allocation overhead` |

---

## Community & Support

* **Bug Reports & Feature Requests**: Submit an issue on [GitHub Issues](https://github.com/lumi-devs/lumi/issues).
* **Architectural Discussions**: Start a topic on [GitHub Discussions](https://github.com/lumi-devs/lumi/discussions).
