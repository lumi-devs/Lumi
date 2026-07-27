# Contributing to Lumi

Thank you for considering a contribution to Lumi! This document outlines our setup process, architectural conventions, coding guidelines, and review standards.

---

## 📖 Key Documentation References

Before writing code or opening pull requests, review these core documentation guides:

- 📐 **[docs/architecture.md](docs/architecture.md)** — Microservices topology, event bus streaming, RabbitMQ RPC, and runtime roles.
- 🛠️ **[docs/module-development.md](docs/module-development.md)** — Comprehensive step-by-step module developer guide, `@DefineModule`, Sapphire commands, services, cards, permissions, and i18n.
- ⚙️ **[docs/configuration.md](docs/configuration.md)** — Environment variable specifications and Shapeshift config schema rules.

---

## 🛠️ Prerequisites

| Tool | Version | Notes |
|---|---|---|
| [Bun](https://bun.sh) | 1.1+ | Primary runtime and workspace package manager |
| PostgreSQL | 16+ | Database persistence (Local or Docker) |
| Redis | 7+ | Cache & Redis Streams event bus (Local or Docker) |
| RabbitMQ | 3.12+ | RPC bridge & event fanout (Local or Docker) |

Quickly launch all infrastructure services via Docker:

```bash
docker compose up -d postgres redis rabbitmq
```

---

## 💻 Local Setup

```bash
# 1. Fork and clone the repository
git clone https://github.com/lumi-devs/lumi.git && cd lumi

# 2. Install workspace dependencies
bun install

# 3. Generate Prisma client
bun run db:generate

# 4. Push database schema (development sync)
bun run db:push

# 5. Copy environment template and set credentials
cp .env.example .env
# Set BOT_TOKEN and CLIENT_ID in .env

# 6. Start Lumi in monolith development mode
bun run dev
```

---

## 🏗️ Monorepo & Architectural Guidelines

### 1. Cross-Package Imports
Lumi operates as a Bun workspace monorepo (`packages/*` and `apps/*`).
- **RULE**: Cross-package imports MUST use `@lumi/<package>` specifiers (e.g., `import { RpcRequest } from "@lumi/contracts"`).
- **PROHIBITED**: **Never** use relative paths between workspace packages (e.g., `import ... from "../../packages/contracts"` is forbidden).
- **Extension Rule**: Always append `.js` to internal package specifiers and aliased imports (e.g., `import { BaseCommand } from "#lib/commands.js"`), even though source files end in `.ts`.

### 2. Module System Guardrails
All feature modules reside in `packages/core/src/modules/<name>/`.
- **Zero Cross-Module Imports**: A module MUST NEVER import directly from a sibling module. All shared capabilities must be refactored into `packages/core/src/lib/` or shared utilities.
- **Service Pattern**: Module services must extend `Service` (`#lib/module-system/Service.js`) and be accessed via `getService("<svc>")` or `tryGetService("<svc>")`.
- **Database Access**: Always use `container.db` (`DatabaseService`). Never call `container.prisma` directly inside module code.
- **Card System**: Never construct raw Discord embeds. Use standard card builders from `src/lib/utilities/cards.ts` (`makeSuccessCard`, `makeErrorCard`, `makeWarningCard`, `makeInfoCard`, `makeListCard`) and reply helpers (`replySuccess`, `replyError`, `replyWarning`, `replyInfo`).
- **Safe JSON & Utilities**: Never use `JSON.parse` inside try/catch blocks; use `tryParseJSON` from `@sapphire/utilities`. Use `.filter(filterNullish)` instead of `.filter(Boolean)` on typed arrays.
- **i18n Requirement**: All user-facing interaction responses must be translated in all four shipping locales (`en-US`, `de`, `es-ES`, `fr`) in `packages/core/src/languages/`.

---

## 🧪 Running Checks

```bash
# Type-check the monorepo workspace
bun run typecheck

# Execute ESLint checks (with auto-fix)
bun run lint

# Run the test suite
bun run test

# Run a specific module test file
bunx vitest run packages/core/tests/modules/afk/afk.test.ts
```

---

## 📝 Commit Convention

Lumi follows the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <short summary>
```

| Type | Description | Example |
|---|---|---|
| `feat` | New feature or command | `feat(mod): add /quarantine command with role-lock` |
| `fix` | Bug fix | `fix(filter): prevent false positives on quoted URLs` |
| `docs` | Documentation update | `docs(contributing): update monorepo guidelines` |
| `refactor` | Code change without behavioral change | `refactor(event-bus): optimize stream claim logic` |
| `test` | Adding or updating tests | `test(afk): add test case for auto-clear on speak` |
| `chore` | Build scripts or dependency updates | `chore(deps): update sapphire framework packages` |

---

## 🚀 Pull Request Checklist

1. Create a feature branch off `master`: `git checkout -b feat/my-feature`.
2. Implement your changes adhering to `docs/module-development.md` standards.
3. If adding a new module, generate static manifests using `bun run modules:manifest`.
4. Ensure all checks pass: `bun run typecheck`, `bun run lint`, and `bun run test`.
5. Open a Pull Request on GitHub with a thorough description of changes and verification steps.
6. Acknowledge and resolve maintainer review feedback prior to merge.

---

## ❓ Questions & Support

For questions, open a [GitHub Discussion](https://github.com/lumi-devs/lumi/discussions) or create an issue with the `question` label.
