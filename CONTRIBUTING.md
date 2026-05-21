# Contributing to Ember

First off, thank you for considering contributing to Ember! It's people like you that make Ember such a powerful and modular tool for the Discord community.

This document is a set of guidelines for contributing to Ember. These are mostly guidelines, not rules. Use your best judgment, and feel free to propose changes to this document in a pull request.

---

## 🛠️ Getting Started

Before you start, ensure you have the following installed:
- **[Bun](https://bun.sh)** (v1.1 or higher)
- **PostgreSQL**
- **Redis**
- **RabbitMQ** (Optional, for event bus features)

### Local Setup

1. **Fork and Clone:**
   ```bash
   git clone https://github.com/your-username/ember-ts.git
   cd ember-ts
   ```

2. **Install Dependencies:**
   ```bash
   bun install
   ```

3. **Environment Setup:**
   ```bash
   cp .env.example .env
   # Fill in your BOT_TOKEN, CLIENT_ID, and database URLs
   ```

4. **Database Initialization:**
   ```bash
   bun run db:push
   bun run db:generate
   ```

5. **Start Developing:**
   ```bash
   bun run dev
   ```

---

## 🎨 Code Style

To maintain a consistent codebase, we enforce strict linting and formatting rules. We use **ESLint** and **Prettier** with the Sapphire Framework's recommended configurations.

| Tool | Command | Description |
| :--- | :--- | :--- |
| **Linter** | `bun run lint` | Runs ESLint to check for code quality issues. |
| **Typecheck** | `bun run typecheck` | Validates TypeScript types across the project. |
| **Formatter** | `prettier --write .` | Formats code according to our style guide. |

### Key Style Rules:
- **TypeScript:** Use strict typing. Avoid `any` at all costs.
- **Modularity:** Features must live in `src/modules/{name}/`.
- **Isolation:** Modules must **never** import from each other. Shared logic goes in `src/lib/`.

---

## 📝 Commit Message Convention

We follow the **[Conventional Commits](https://www.conventionalcommits.org/)** specification. This allows us to automatically generate changelogs and manage versions.

### Format: `<type>(<scope>): <description>`

| Type | Description |
| :--- | :--- |
| **feat** | A new feature or module. |
| **fix** | A bug fix. |
| **docs** | Documentation changes only. |
| **style** | Changes that do not affect the meaning of the code (white-space, formatting, etc). |
| **refactor** | A code change that neither fixes a bug nor adds a feature. |
| **perf** | A code change that improves performance. |
| **test** | Adding missing tests or correcting existing tests. |
| **chore** | Changes to the build process or auxiliary tools and libraries. |

**Example:** `feat(afk): add support for global AFK status`

---

## ⚖️ The Four Golden Rules

These rules are non-negotiable and ensure the architectural integrity of Ember.

> [!IMPORTANT]
> 1. **Never `new EmbedBuilder()`** — Every user-facing reply must go through the UI factories in `src/lib/util/cards.ts` (e.g., `makeSuccessCard`, `makeErrorCard`).
> 2. **Use `container.prisma` directly** — All database access goes through the Prisma Client instance on the container. Do not create unnecessary wrapper classes.
> 3. **Slash Command Groups** — All user-facing features must be slash commands. Use groups (e.g., `/birthday set`) instead of flat names (e.g., `/birthday_set`).
> 4. **Throw Errors, Never Send Them** — Throw typed errors from `src/core/errors.ts`. A global listener catches these and renders them as consistent error cards.

---

## 🚀 Pull Request Workflow

1. **Branching:** Create a new branch from `main`. Use a descriptive name: `feat/afk-system` or `fix/permissions-check`.
2. **Quality Check:** Ensure your code passes `bun run lint` and `bun run typecheck`.
3. **Draft PR:** If your work is in progress, open a Draft PR to gather early feedback.
4. **Review:** At least one maintainer must approve your PR before it can be merged.
5. **Squash and Merge:** We prefer squashing commits to keep the history clean.

---

## 🛡️ Technical Standards

### Module Isolation
Ember is designed to be highly modular.
- **Zero Coupling:** `src/modules/raids` must not know `src/modules/afk` exists.
- **GDPR Compliance:** Every module must implement a `deleteUserData` handler in its registry to support data deletion requests.
- **Prisma Schema:** Define module-specific tables in `prisma/schema.prisma` using clear naming conventions.

### UI & Branding
- Use `EmberColors` and `EmberIcons` from `src/core/branding.ts` for consistency.
- Avoid raw strings for user-facing text; use the i18next-based translation system.

---

Thank you for helping us build the future of modular Discord bots! 🌟
