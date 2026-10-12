# Contributing to Lumi

Thank you for your interest in contributing to Lumi! This guide provides complete instructions for setting up your local environment, adhering to project architecture standards, submitting Pull Requests, and verifying your changes.

> [!IMPORTANT]
> Before writing code, review **[AGENTS.md](AGENTS.md)**. It serves as the single source of truth for repository layout, architectural boundaries, module contracts, and UI card standards.

---

## Toolchain & Prerequisites

Ensure the following prerequisites are installed on your workstation:

| Dependency | Minimum Version | Recommended Installation | Notes |
| :--- | :--- | :--- | :--- |
| **[Bun](https://bun.sh)** | `1.4.2+` | <code>curl -fsSL https://bun.sh/install &#124; bash</code> | Primary JavaScript runtime, package manager, and test runner |
| **Node.js** | `26.0.0+` | `nvm install 26` | Required for tooling compatibility and typechecking |
| **PostgreSQL** | `17.0+` | Docker / Native | Relational database (uses PgBouncer connection pooler) |
| **Valkey** | `8.0+` | Docker / Native | High-speed cache, rate limiting, and Valkey Streams event bus |
| **Nix** | Optional | [Nix Package Manager](https://nixos.org) | Declarative shell environment via `nix develop` |

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
nix develop --command bun install
```

### 2. Infrastructure Backends (Docker Compose)

Start PostgreSQL, PgBouncer, and Valkey containerized services:

```bash
docker compose up -d postgres pgbouncer valkey
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

Start Lumi in single-process development mode:

```bash
bun run dev
```

---

## Releases & Release Notes

Notable changes are tracked with Changesets (`.changeset/`). If your PR
changes behavior, run `bunx changeset` and include the generated file.

Pushing a `v*` tag runs `.github/workflows/release.yml`, which publishes
a GitHub Release with notes generated from the merged pull requests
since the previous tag.

Because the notes are built from PR titles, give your PR a clear, specific title (for example `fix(mod): warn count ignores decayed cases`).

---

## Code Standards & Architectural Rules

To maintain high software quality across the single-process monolith, all contributions must strictly conform to these core development rules:

> [!WARNING]
> PRs that violate module boundaries or data layer abstractions will be requested to make architectural revisions before code review.

### 1. Module Isolation Boundary

Modules inside `src/modules/` **must never** import code directly from sibling modules.

```ts
// ❌ Disallowed: Cross-module direct import
import { MuteService } from "../mod/services/MuteService.js";

// ✅ Allowed: Inter-module communication via typed utilities or the event bus
import { getUtility } from "#src/lib/module-system/Utility.js";
const filter = getUtility("filter");
```

### 2. Data Access Layer Abstraction

Never use `container.prisma` directly inside commands or modules. Always route database operations through `container.db` (the repository abstraction layer).

```ts
// ❌ Disallowed
const guild = await container.prisma.guild.findUnique({ where: { id: guildId } });

// ✅ Allowed
const guild = await container.db.guilds.get(guildId);
```

### 3. Card UI System

Raw Discord embeds (`EmbedBuilder`) are strictly prohibited in user-facing command responses. Always construct UI responses using Lumi's standardized card primitives:

```ts
import { makeSuccessCard } from "#src/lib/ui/Cards.js";

// Respond with standardized success feedback
await ctx.replySuccess("Settings Saved", "Updated moderation threshold.");
```

### 4. Code Hygiene & Utility Functions

* **JSON Parsing**: Never place raw `JSON.parse()` calls inside generic `try/catch` blocks. Use `tryParseJSON` from `#src/shared/Index.ts`.
* **Array Filtering**: Do not filter typed arrays using `.filter(Boolean)`. Use `.filter(filterNullish)` from `#src/shared/Index.ts`.
* **Configuration Validation**: All module configurations must define a strict schema using the `cfg.*` helpers from `#src/lib/module-system/ConfigSchema.js` inside `defineModule`.

### 5. Internationalization (i18n)

All user-facing strings must be localized through `src/lib/i18n/` (`ctx.fetchT()` / `fetchTyped()`). Every command string key must exist in `en-US` at minimum; translations for other locales are sourced via Crowdin (`crowdin.yml`).

Translation files reside in `src/languages/<locale>/`.

---

## Verification & Testing Suite

Run the full verification suite locally prior to pushing your branch:

```bash
# 1. TypeScript compilation check
bun run typecheck

# 2. ESLint linting (check-only, matches CI)
bun run lint

# 2b. ESLint with auto-fixes, for local cleanup
bun run lint:fix

# 3. Unit and integration tests (Bun)
bun run test

# 4. Coverage (matches CI)
bun run test:coverage

# 5. Addon structure, import, and UI checks
bun run validate
```

| Verification Command | Execution Tool | Target / Description |
| :--- | :--- | :--- |
| `bun run typecheck` | `tsc` | Type checking without emitting files |
| `bun run lint` | `eslint` | Code style enforcement (check-only, no auto-fix) |
| `bun run lint:fix` | `eslint --fix` | Same checks, with auto-fixes applied locally |
| `bun run test` | `bun test` | Unit and integration tests under `tests/` |
| `bun run test:coverage` | `bun test --coverage` | Same tests with coverage |
| `bun run validate` | Bun TS | Addon structure, import, and UI checks |

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
| `chore` | Build tasks, package management, dependencies | `chore(deps): update discord.js` |
| `perf` | Code changes that improve performance | `perf(event-bus): reduce stream consumer allocation overhead` |

---

## Community & Support

* **Bug Reports & Feature Requests**: Submit an issue on [GitHub Issues](https://github.com/lumi-devs/lumi/issues).
* **Architectural Discussions**: Start a topic on [GitHub Discussions](https://github.com/lumi-devs/lumi/discussions).
