# SCOUT REPORT: Root Configuration, Build Tooling, and Environment

**Target**: `/home/rebiz/opt/workdir/lumi-v2/`
**Date**: 2026-11-25
**Scope**: Root configuration files (`package.json`, `tsconfig.json`, `biome.json`, `Dockerfile`, `flake.nix`, `bunfig.toml`, `AGENTS.md`, `Taskfile.yml`, `vitest.config.ts`, `prisma.config.ts`, `docker-compose.yml`, `.env.example`), `scripts/` directory, and dashboard configuration.

---

## Executive Summary

Lumi v2 is built as a TypeScript monorepo hosted primarily on the **Bun** runtime (v1.4.4+), utilizing a dual-process deployment model (Bot process + SvelteKit Dashboard process) mediated by an internal HTTP RPC protocol. The bot runs as a single-process service backed by PostgreSQL 18 and Redis 8, with modular toggleable features, an in-house permit engine, tiered caching (LRU + Redis), and an add-on runtime driven by git.

While the architecture is modern and intentionally decoupled, the build and configuration layer contains several non-trivial shims, native binary workarounds (node-canvas, Prisma query engines under Nix/Bun), and tooling bifurcations (Prettier for formatting vs Biome for linting). This report details every configuration facet to inform the planned clean rewrite.

---

## 1. Dependencies and Versions

### 1.1 Root Production Dependencies (`dependencies`)

| Package | Version | Purpose & Architectural Role |
| :--- | :--- | :--- |
| `@prisma/client` | `^7.10.1` | Generated ORM client for PostgreSQL access across database services |
| `canvas` | `^3.2.3` | Cairo/Pango C++ native module for rendering dynamic graphics (Quote cards, welcome cards, stats charts) |
| `discord.js` | `^14.28.1` | Discord API wrapper for Gateway, REST, and interaction handling |
| `ioredis` | `^6.1.0` | Redis client handling L2 cache, pub/sub invalidation bus, distributed locks, and cooldowns |
| `isomorphic-git` | `^1.44.19` | Pure TypeScript Git implementation used by `@lumi/downloader` to clone and update add-on repos without spawning native git CLI |
| `prisma` | `^7.10.1` | Prisma CLI compiler for migration and schema code-generation |
| `zod` | `^4.6.7` | Runtime type assertion and validation for manifests, configs, and RPC payloads |

### 1.2 Root Development Dependencies (`devDependencies`)

| Package | Version | Purpose & Architectural Role |
| :--- | :--- | :--- |
| `@biomejs/biome` | `^2.6.8` | Rust-based ultra-fast linter with custom import restriction rules |
| `@types/bun` | `^1.4.5` | TypeScript types for Bun globals, server APIs, and file I/O |
| `@vitest/coverage-v8`| `^5.1.1` | Code coverage provider using V8 native coverage instrumentation |
| `prettier` | `^3.10.1` | Source code formatter (handles TS, JS, JSON, and Svelte via plugin) |
| `prettier-plugin-svelte` | `^4.2.0` | Svelte AST formatter plugin for Prettier |
| `typescript` | `^6.0.3` | Monorepo typechecker (`tsc --noEmit`) |
| `vitest` | `^5.1.1` | Monorepo test runner replacing Bun's built-in test runner |

### 1.3 Dashboard Dependencies (`apps/dashboard/package.json`)

- **Production**:
  - `@lumi/cache`, `@lumi/foundation`, `@lumi/module-kit`, `@lumi/redis`: Monorepo workspace packages (`workspace:*`)
  - `@prisma/adapter-pg`: `^7.10.1` (Postgres driver adapter for Prisma 7)
  - `@prisma/client`: `^7.10.1`
  - `ioredis`: `^6.1.0`
  - `pg`: `^8.23.1` (PostgreSQL client pool for adapter)
  - `prisma`: `^7.10.1`
  - `zod`: `^4.6.7`
- **Development**:
  - `@sveltejs/kit`: `^3.4.0` (SvelteKit framework)
  - `@sveltejs/adapter-node`: `^6.0.5` (Node/Bun standalone production server build)
  - `svelte`: `^5.59.1` (Svelte 5 runes-based UI framework)
  - `vite`: `^8.3.8` (Dashboard build tool & dev server)
  - `svelte-check`: `^4.7.8` (Svelte typechecker)
  - `@types/pg`: `^8.23.1`, `@types/node`: `26.6.5`
  - `dotenv`: `^18.0.10`

### 1.4 Package Overrides & Engine Constraints

- **Engines**: `"bun": ">=1.4.4"`
- **Package Manager**: `"bun@1.4.4"`
- **Overrides**: `"effect": "^3.22.1"`
  - *Reasoning*: `@prisma/config@7.10.1` internally specifies `effect: 3.20.0`. The root `package.json` forces `^3.22.1` to resolve dependency conflicts or security advisories across nested Effect versions.

---

## 2. Scripts and Automation Inventory

### 2.1 `package.json` Scripts

| Script | Command | Purpose & Behavior |
| :--- | :--- | :--- |
| `typecheck` | `tsc --noEmit` | Validates TypeScript types across the bot, packages, and modules (excluding `apps/dashboard` which has separate Svelte types). |
| `lint` | `biome lint .` | Runs Biome linter across sources, packages, tests, and dashboard code. |
| `lint:fix` | `biome lint --write .` | Automatically fixes safe linter diagnostics. |
| `format` | `prettier --write .` | Formats the entire codebase using Prettier with Svelte plugin. |
| `format:check` | `prettier --check .` | Verifies code formatting in CI without writing changes. |
| `test` | `cd apps/dashboard && ./node_modules/.bin/svelte-kit sync && cd ../.. && vitest run` | First syncs SvelteKit route types so dashboard tests pass import checks, then executes Vitest once across all test suites. |
| `test:watch` | `cd apps/dashboard && ./node_modules/.bin/svelte-kit sync && cd ../.. && vitest` | Watches workspace files and reruns Vitest suites on save. |
| `test:coverage`| `cd apps/dashboard && ./node_modules/.bin/svelte-kit sync && cd ../.. && vitest run --coverage` | Executes Vitest with V8 coverage collector (HTML/text reports). |
| `setup` | `bun run scripts/setup.ts` | Interactive CLI wizard that validates environment requirements, sets `.env`, generates Docker Compose secrets, verifies DB/Redis connectivity, and runs migrations. |
| `setup:check` | `bun run scripts/setup.ts --check` | Non-interactive configuration validator; verifies required `.env` keys and database connectivity without altering files. |
| `seed` | `bun run scripts/seed.ts` | Populates database with default guild entry, enables default modules (`mod`, `logs`, `autorole`, `reminders`), and registers an initial Admin permit for owners. |
| `db:studio` | `prisma studio` | Opens the web-based Prisma Studio database viewer. |
| `db:generate`| `prisma generate && bun scripts/sync-prisma.ts` | Compiles Prisma client and copies `.prisma/client` artifacts into Bun's isolated workspace package cache to fix Bun module resolution. |
| `db:migrate` | `prisma migrate dev` | Applies schema changes to local development Postgres database. |
| `db:migrate:deploy` | `prisma migrate deploy` | Applies migrations in production/Docker containers without interactive prompts. |
| `build` | `bun build src/index.ts --target=bun --external canvas --outdir=dist` | Bundles bot application into `dist/index.js`. Explicitly flags `canvas` as external because native C++ bindings cannot be packed into Bun's JS bundle. |
| `docker:build` | `docker build --format docker -t lumi-bot:latest -f Dockerfile . && docker build --format docker -t lumi-dashboard:latest -f apps/dashboard/Dockerfile .` | Compiles both production Docker images. |
| `dev:bot` | `bun --watch src/index.ts` | Boots the bot process in hot-reloading development mode. |
| `dashboard:dev` | `cd apps/dashboard && ./node_modules/.bin/vite dev --host 0.0.0.0 --port 4173` | Runs dashboard Vite dev server listening on port 4173. |
| `dashboard:sync`| `cd apps/dashboard && ./node_modules/.bin/svelte-kit sync` | Regenerates `.svelte-kit/tsconfig.json` and type definitions. |
| `dashboard:build` | `cd apps/dashboard && ./node_modules/.bin/vite build` | Builds standalone dashboard server into `apps/dashboard/build`. |
| `dashboard:typecheck` | `cd apps/dashboard && ./node_modules/.bin/svelte-kit sync && ./node_modules/.bin/svelte-check --tsconfig ./tsconfig.json && ./node_modules/.bin/tsc --noEmit` | Full Svelte and TypeScript verification of dashboard frontend and backend. |
| `addon:create` | `bun scripts/create-addon.ts` | Scaffolds directory, `manifest.json`, `index.ts`, and test boilerplate for a new add-on module. |
| `addon:link` | `bun scripts/link-addon.ts` | Symlinks an external add-on directory into `data/addons/<name>` and installs its production dependencies. |
| `addon:unlink` | `bun scripts/link-addon.ts unlink` | Unlinks an add-on directory from `data/addons/`. |
| `addon:validate` | `bun scripts/validate-addon.ts` | Runs static analysis on an add-on: checks manifest fields, apiVersion 2, entry point, forbidden imports, and file escaping. |

### 2.2 Deep-Dive into Custom Scripts (`scripts/`)

1. **`scripts/sync-prisma.ts`**:
   - *Problem*: Bun symlinks packages in `.bun/` store or hoists packages into workspace node_modules. When `prisma generate` runs, it writes to `node_modules/.prisma/client`. In Bun monorepos, workspace packages importing `@prisma/client` look into their own hoisted node_modules where `.prisma` is missing, throwing runtime import errors.
   - *Mechanism*: Scans `node_modules/.bun/@prisma+client*` directories and copies the generated `node_modules/.prisma` folder directly into each resolved client package path.

2. **`scripts/setup.ts` & `scripts/setup/*`**:
   - Modular setup suite:
     - `dependencies.ts`: Validates Bun version `>=1.4.4`, flags missing git/docker.
     - `discord.ts`: Validates bot token format (3 parts separated by dots) or MFA token; validates 17-20 digit snowflake owner IDs.
     - `database.ts`: Verifies PostgreSQL connectivity using `pg.Client`, runs Prisma migrations, creates database if missing.
     - `redis.ts`: Connects to Redis, performs PING/PONG and cache namespace check.
     - `env.ts`: Merges answers with `.env.example`, generating cryptographically secure secrets (`SESSION_SECRET`, `RPC_INTERNAL_TOKEN`, compose DB passwords).
     - `prompts.ts`: Interactive terminal questions with fallback defaults.

3. **`scripts/dev.sh`**:
   - Orchestrates local containerized developer workflows with options: `--build`, `--logs`, `--clean`, `--migrate`, `--pull`.
   - Sets up default development environment variables if `.env` does not exist.

4. **`scripts/backup.sh` & `scripts/restore.sh`**:
   - `backup.sh`: Performs hot database backups using `pg_dump -Fc` (custom archive format) or `pg_basebackup`, executes Redis `BGSAVE` and captures `dump.rdb`, compresses archives with gzip, applies retention policies (default 7 days), and optionally uploads to AWS S3 (`aws s3 cp`).
   - `restore.sh`: Interactive restore tool that terminates active PostgreSQL client connections (`pg_terminate_backend`), drops and recreates the target database, streams `pg_restore`, runs `prisma migrate deploy`, and restores Redis keys via `--pipe`.

5. **`scripts/validate-addon.ts`**:
   - Enforces the Lumi v2 Addon Security Model:
     - Checks `manifest.json` schema (`name`, `version`, `description`, `apiVersion: 2`, `author`).
     - Verifies manifest `name` matches folder name exactly.
     - Checks for `README.md` presence.
     - AST/regex scan of source code to prevent escaping imports (`../..`), absolute imports, or unauthorized core imports (modules must consume `@lumi/module-kit` and helpers, not raw `@lumi/db` or `ioredis`).

6. **`Taskfile.yml`**:
   - Provides developer shorthand aliases for common CLI commands: `task dev`, `task bot`, `task db`, `task test`, `task lint`, `task format`, `task build`.

---

## 3. TypeScript Configuration

### 3.1 Root `tsconfig.json`

- **Compiler Options**:
  - `target`: `"ES2022"`
  - `module`: `"ESNext"`
  - `moduleResolution`: `"bundler"` (uses modern bundler-compatible resolution with package.json `exports`)
  - `moduleDetection`: `"force"` (treats every file as a module)
  - `allowImportingTsExtensions`: `true` (enables importing `.ts` files directly in source)
  - `verbatimModuleSyntax`: `true` (enforces strict separation between type imports `import type` and value imports)
  - `lib`: `["ES2022"]`
  - `types`: `["bun"]` (provides Bun global type definitions)
  - `noEmit`: `true` (TypeScript operates solely as a typechecker; Bun and Vite handle execution/compilation)

- **Strictness Matrix**:
  ```json
  "strict": true,
  "noImplicitOverride": true,
  "noFallthroughCasesInSwitch": true,
  "noUnusedLocals": true,
  "noUnusedParameters": true,
  "skipLibCheck": true,
  "forceConsistentCasingInFileNames": true
  ```

- **Workspace Path Mappings (`compilerOptions.paths`)**:
  ```json
  "@lumi/core": ["./src/core"],
  "@lumi/admin": ["./src/admin"],
  "@lumi/permits": ["./packages/permits/src"],
  "@lumi/cache": ["./packages/cache/src"],
  "@lumi/redis": ["./packages/redis/src"],
  "@lumi/db": ["./packages/db/src"],
  "@lumi/foundation": ["./packages/foundation/src"],
  "@lumi/ui": ["./packages/ui/src"],
  "@lumi/observability": ["./packages/observability/src"],
  "@lumi/scheduler": ["./packages/scheduler/src"],
  "@lumi/cron": ["./packages/cron/src"],
  "@lumi/module-kit": ["./packages/module-kit/src"],
  "@lumi/module-runtime": ["./packages/module-runtime/src"],
  "@lumi/downloader": ["./packages/downloader/src"]
  ```
  *Key Finding*: Paths point directly to `./packages/*/src`. There is no package build step required for local typechecking or test execution. However, each `packages/*/package.json` specifies `"main": "dist/index.js"` and `"types": "dist/index.d.ts"`, creating a dual-resolution model.

- **Excludes**: `["node_modules", "dist", "build", "apps/dashboard"]` (Dashboard is excluded because SvelteKit manages its own tsconfig).

### 3.2 Dashboard `apps/dashboard/tsconfig.json`

- Extends `./.svelte-kit/tsconfig.json` (dynamically generated by `svelte-kit sync`).
- Enables `strict: true` and `moduleResolution: "bundler"`.
- Mirrors package path mappings (`@lumi/* -> ../../packages/*/src`) so the dashboard directly imports shared packages during SSR without prior building.

---

## 4. Linting and Formatting Architecture

### 4.1 Biome Linter (`biome.json`)

- **Schema**: `https://biomejs.dev/schemas/2.6.5/schema.json`
- **Formatter**: `"formatter.enabled": false` — Formatter is intentionally disabled in Biome to prevent conflicts with Prettier.
- **Linter Rules**: Preset `"recommended"`.
- **Global Adjustments**:
  - `suspicious.noExplicitAny`: `"error"` (strict typing enforced).
  - `style.noNonNullAssertion`: `"off"` (allows TypeScript non-null assertions `!`).

### 4.2 Architectural Boundary Enforcement

Biome enforces strict architectural layering via `noRestrictedImports` overrides on `modules/**/*.ts`:
```json
"noRestrictedImports": {
  "level": "error",
  "options": {
    "paths": {
      "@prisma/client": "Use services.helpers for database access.",
      "@lumi/db": "Use services.helpers for database access.",
      "@lumi/cache": "Use services.helpers.cache for cache access.",
      "@lumi/redis": "Use services.helpers.cache for cache access.",
      "ioredis": "Use services.helpers.cache for cache access."
    }
  }
}
```
*Significance*: Modules are completely isolated from low-level database and Redis clients. Feature modules are restricted to interacting only through scoped helpers (`services.helpers`), guaranteeing multi-tenant isolation, cache consistency, and audit logging.

In addition, `tests/**/*.ts` relaxes `noExplicitAny` to `"off"` for test mocking convenience.

### 4.3 Prettier Formatting (`.prettierrc.json`)

- Plugins: `prettier-plugin-svelte`
- Settings: `semi: true`, `singleQuote: true`, `tabWidth: 2`, `trailingComma: "es5"`, `printWidth: 100`.
- `.prettierignore` excludes `dist`, `build`, `node_modules`, `coverage`, `.svelte-kit`, and generated Prisma artifacts.

---

## 5. Docker and Containerization Setup

### 5.1 Root Bot `Dockerfile`

- **Base Image**: `docker.io/oven/bun:1.4.4-alpine`
- **Multi-Stage Architecture**:
  1. **Stage 1 (`base`)**:
     - Installs native compilation tools and C++ library headers via Alpine apk:
       `python3`, `make`, `g++`, `vips-dev`, `cairo-dev`, `pango-dev`, `giflib-dev`.
     - Caches dependency installation with `bun install --frozen-lockfile --production`.
     - Generates Prisma client with dummy database URL: `DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder bun run db:generate`.
     - Bundles application into `dist/index.js` via `bun run build`.
  2. **Stage 2 (`runtime`)**:
     - Installs minimal runtime dynamic libraries: `vips`, `cairo`, `pango`, `giflib`, `font-noto`, `curl`, `tini`.
     - Drops all build dependencies and dev tools.
     - Copies artifacts (`node_modules`, `dist`, `packages`, `modules`, `tsconfig.json`, `package.json`, `bunfig.toml`, `prisma.config.ts`) owned by `bun:bun` (uid 1000).
     - Creates writable directory `/app/data/addons`.
     - Switches to non-root user: `USER bun`.
     - Exposes port `8091` (Internal RPC) and `9090` (Prometheus metrics).
     - Configures native Docker healthcheck: `curl -f http://localhost:8091/healthz || exit 1`.
     - Process supervision: Uses `tini` as PID 1 to reap zombie processes from native subshells/bun child tasks.
     - Entrypoint: `["tini", "--", "bun"]`, CMD: `["dist/index.js"]`.

### 5.2 Dashboard `apps/dashboard/Dockerfile`

- **Three-Stage Build**:
  1. `builder`: Installs full dependencies with `--ignore-scripts`, runs `prisma generate`, `svelte-kit sync`, and builds SvelteKit via Vite (`bun run build`).
  2. `prod-deps`: Fresh install of `--production` dependencies only and regenerates Prisma client.
  3. `runtime`: Alpine + `curl` + `tini`, copies production `node_modules`, `packages`, `build`, runs as non-root `USER bun` on port `4173`. Healthcheck probes `http://localhost:4173/healthz`.

### 5.3 `docker-compose.yml` Service Architecture

- **Shared Security Hardening Profile** (`&hardening` anchor):
  - `init: true` (Tini init handling)
  - `security_opt: [no-new-privileges:true]`
  - `cap_drop: [ALL]` (Drops all Linux capabilities)
  - `read_only: true` (Read-only root container filesystem)
  - `tmpfs: [/tmp:exec,size=256M]` (Memory-backed executable tmpfs for Bun JIT / native temp files)
  - `logging: json-file` with size limits (10MB max, 3 files)

- **Services**:
  1. `postgres`: `postgres:18-alpine` with healthcheck (`pg_isready`), volume `postgres_data`, custom `postgresql.conf`.
  2. `redis`: `redis:8-alpine` with password auth, healthcheck (`redis-cli ping`), volume `redis_data`, custom `redis.conf`.
  3. `migrate`: Ephemeral service using `lumi-bot:latest` that runs `bun run db:migrate:deploy` against Postgres once Postgres is healthy; exits 0 before bot starts.
  4. `bot`: Runs `lumi-bot:latest` depending on `postgres` (healthy), `redis` (healthy), and `migrate` (completed successfully). Mounts persistent `lumi_data` to `/app/data`.
  5. `dashboard`: Runs `lumi-dashboard:latest` on port `4173`, communicates with bot via internal Docker network (`http://bot:8091`) using `RPC_INTERNAL_TOKEN`.

---

## 6. Nix / Flake Setup

### 6.1 `flake.nix` Overview

- **Inputs**: `nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable"`.
- **Supported Systems**: `x86_64-linux`, `aarch64-linux`, `x86_64-darwin`, `aarch64-darwin`.
- **Packages Provided in Dev Shell**:
  `bun`, `nodejs`, `git`, `gh`, `jq`, `openssl`, `util-linux`, `postgresql`, `redis`, `prisma-engines`, `stdenv.cc.cc.lib`, `biome`.

### 6.2 Prisma & Native Module Bridging in Nix

Standard Prisma installs download pre-compiled glibc binaries that fail on NixOS due to dynamic linker path expectations (`/lib64/ld-linux-x86-64.so.2` missing). The flake explicitly injects system Nixpkgs binaries:
```nix
PRISMA_QUERY_ENGINE_LIBRARY = "${pkgs.prisma-engines}/lib/libquery_engine.node";
PRISMA_SCHEMA_ENGINE_BINARY = "${pkgs.prisma-engines}/bin/schema-engine";
BIOME_BINARY = "${pkgs.biome}/bin/biome";
```
In `shellHook`:
```bash
export LD_LIBRARY_PATH="${pkgs.stdenv.cc.cc.lib}/lib:${pkgs.util-linux.lib}/lib:$LD_LIBRARY_PATH"
```
*Significance*: `stdenv.cc.cc.lib` provides `libstdc++.so.6` and `util-linux.lib` provides `libuuid.so.1`, both strictly required for `canvas` (Cairo/Pango bindings) and Prisma native query engine to run seamlessly in local dev shells.

---

## 7. Environment Variables & Feature Flags

### 7.1 Bot Process Environment

| Variable | Type / Default | Description & Constraints |
| :--- | :--- | :--- |
| `BOT_TOKEN` | String (Required) | Discord Bot Token. Validated for 3 segments or MFA format. |
| `OWNER_IDS` | CSV (Required) | Comma-separated Discord snowflake user IDs (17-20 digits) granted superuser privileges. |
| `DATABASE_URL` | URI (Required) | PostgreSQL connection URI (`postgresql://user:pass@host:port/db`). |
| `REDIS_URL` | URI (Required) | Redis connection URI (`redis://:pass@host:port/db`) or separate `REDIS_HOST`, etc. |
| `CACHE_NAMESPACE` | String (`"lumi"`) | Key namespace prefix for Redis cache and pub/sub channels. |
| `LOG_LEVEL` | String (`"info"`) | Log verbosity: `fatal`, `error`, `warn`, `info`, `debug`, `trace`. |
| `METRICS_ENABLED` | Boolean (`"true"`) | Feature flag: Enables Prometheus `/metrics` and `/healthz` HTTP server. |
| `METRICS_PORT` | Number (`9090`) | Port for the Prometheus metrics HTTP listener. |
| `DEFAULT_PREFIX` | String (`","`) | Fallback prefix for text-based commands. |
| `RPC_HTTP_HOST` | String (`"127.0.0.1"`) | Bind address for bot RPC server (`0.0.0.0` in Docker). |
| `RPC_HTTP_PORT` | Number (`8091`) | Internal HTTP RPC port for communication with the dashboard. |
| `RPC_INTERNAL_TOKEN` | String (Secret) | Shared bearer authentication token required for non-loopback `/api/v1/*` requests. |
| `GIT_TOKEN` | String (Optional) | Personal Access Token for authenticated GitHub downloads of private add-on repos. |
| `GIT_USERNAME` | String (`"x-access-token"`)| Username associated with git credentials. |
| `WEB_BASE_URL` | URL (Optional) | Public URL of dashboard (e.g. `https://lumi.example.com`) for verification links. |

### 7.2 Dashboard Process Environment

| Variable | Type / Default | Description & Constraints |
| :--- | :--- | :--- |
| `RPC_URL` | URL (`http://127.0.0.1:8091`) | Bot RPC server address (`http://bot:8091` in Docker). |
| `RPC_INTERNAL_TOKEN` | String (Required) | Matching secret token for authenticating against the bot RPC server. |
| `DISCORD_CLIENT_ID` | String (Required) | Discord OAuth2 Application ID. |
| `DISCORD_CLIENT_SECRET` | String (Secret) | Discord OAuth2 Client Secret. |
| `DISCORD_OAUTH_REDIRECT_URI` | URL (Required) | OAuth callback endpoint (`${WEB_BASE_URL}/auth/callback`). |
| `SESSION_SECRET` | String (Secret) | 32+ byte cryptographically random secret for signing session cookies and HKDF derivation. |
| `SESSION_TTL_SECONDS` | Number (`604800` = 7d) | Rolling idle session expiration in seconds. |
| `SESSION_MAX_AGE_SECONDS`| Number (`2592000` = 30d)| Maximum hard session lifetime in seconds. |
| `DASHBOARD_INSECURE_COOKIES`| Flag (`"0"`/`"1"`) | Allows unencrypted HTTP cookies during local development testing. |
| `ORIGIN` | URL | SvelteKit CSRF verification origin (`${WEB_BASE_URL}`). |
| `PORT` | Number (`4173`) | HTTP listen port for dashboard server. |

---

## 8. Shims, Compatibility Layers, and Workarounds

Several structural workarounds exist across the configuration files to accommodate Bun, SvelteKit, and native C++ modules:

1. **`scripts/sync-prisma.ts` (Bun Workspace Prisma Hoisting Shim)**:
   - When `prisma generate` creates `@prisma/client`, it outputs to the root `node_modules/.prisma/client`.
   - Bun's isolated workspace package resolver does not look in the root node_modules for hoisted dependencies when packages have isolated package stores.
   - Workaround: A custom Node/Bun script copies `.prisma` into all `.bun/@prisma+client*` directories automatically following every `db:generate`.

2. **`package.json` Effect Override**:
   - Root forces `"overrides": { "effect": "^3.22.1" }`.
   - `@prisma/config@7.10.1` depends on `effect: 3.20.0`. Without this override, multiple incompatible versions of Effect's internal type-level fibers co-exist, breaking compilation.

3. **Native Module Externalization (`--external canvas`)**:
   - In `bun run build`: `bun build src/index.ts --target=bun --external canvas --outdir=dist`.
   - Bun's JS bundler cannot link native C++ `.node` objects or libpango/libcairo system binaries. Attempting to bundle `canvas` causes runtime crashes or build failures.
   - Workaround: Explicitly marked as external, requiring `node_modules/canvas` to be copied wholesale into production containers.

4. **Vitest SvelteKit Sync Chaining**:
   - In `test`, `test:watch`, and `test:coverage`: `cd apps/dashboard && ./node_modules/.bin/svelte-kit sync && cd ../.. && vitest run`.
   - Vitest runs test suites across the entire monorepo, including `apps/dashboard/tests`. Because dashboard tests import `$app/*` and SvelteKit modules, Vitest will fail with unresolved imports unless SvelteKit's virtual `.svelte-kit/` directory has been generated beforehand.

5. **Nix System Dynamic Linking Shims**:
   - In `flake.nix`, Nix explicitly overrides `PRISMA_QUERY_ENGINE_LIBRARY` and `PRISMA_SCHEMA_ENGINE_BINARY` with system nixpkgs paths and sets `LD_LIBRARY_PATH` to link `stdenv.cc.cc.lib` and `util-linux.lib`.
   - Bypasses Prisma's engine downloader which fetches binaries that segfault on NixOS.

6. **TypeScript Monorepo Path Mapping vs Package Exports**:
   - `tsconfig.json` paths route directly to source files (`packages/*/src`).
   - `packages/*/package.json` files define `dist/index.js`.
   - This bypasses build steps during local dev and testing, but requires that packages are not bundled separately for local development.

7. **Biome Linter vs Prettier Formatter Bifurcation**:
   - Biome's formatter is explicitly disabled (`"formatter.enabled": false`). Prettier is retained as the sole formatter because Biome does not natively support Svelte 5 rune formatting or `prettier-plugin-svelte`.

---

## 9. Overall Tech Stack Assessment for Rewrite

| Component | Current Stack | Quality / Maintainability | Assessment & Rewrite Recommendations |
| :--- | :--- | :--- | :--- |
| **Runtime** | Bun 1.4.4 | Medium | Bun provides instant startup and fast testing, but its package resolution and C++ native module support create friction (requiring `sync-prisma.ts` and `--external canvas`). Node 22/24 LTS or standardizing Bun's workspace configuration could eliminate these shims. |
| **Language** | TypeScript 6.0.3 | High | Excellent strictness settings (`strict: true`, `verbatimModuleSyntax: true`). Path mappings work well for dev, but could be cleaner using native package exports or a lightweight build tool like `tsup`. |
| **Formatting / Linting** | Biome 2.6.8 + Prettier 3.10.1 | Medium | Split tooling (Biome for linting, Prettier for formatting) creates cognitive overhead. Biome is gradually expanding Svelte support. If Svelte formatting remains with Prettier, scripts should be consolidated. |
| **Testing** | Vitest 5.1.1 | High | Vitest provides excellent multi-project monorepo testing and v8 coverage. However, the requirement to run `svelte-kit sync` before any test runs should be decoupled via Vitest project configurations or workspaces. |
| **Database** | Prisma 7.10.1 + PostgreSQL 18 | Medium-Low | Prisma 7 introduces heavy Effect dependencies and complex query engine binaries. In a rewrite, consider whether a lighter, native SQL/TypeScript query builder (such as Kysely or Drizzle) would eliminate native engine issues, Nix workarounds, and Bun hoisting bugs entirely. |
| **Cache & Bus** | ioredis 6.1.0 + Redis 8 | High | Clean separation of concerns with L1 LRU + Redis L2, pub/sub cache invalidation bus, and distributed locking. Solid architecture to preserve in the rewrite. |
| **Image Generation** | `canvas` (Cairo/Pango) | Low | Heavy native dependency requiring `vips-dev`, `cairo-dev`, `pango-dev`, and `giflib-dev` in Docker and Nix. Rewrite should consider pure-JS/Wasm SVG renderers (such as `satori` + `@resvg/resvg-js`) to eliminate native compilation dependencies completely. |
| **Process Boundary** | SvelteKit + Bot RPC (Port 8091) | High | Clean architectural boundary. Dashboard has no direct database mutation power over live bot state, preventing split-brain bugs. Highly recommended to retain this RPC-driven decoupling. |
| **Add-on Engine** | `isomorphic-git` | High | Pure JS git engine eliminates system git dependency and sandbox escapes. Manifest validation and API version gating are solid patterns to retain. |

---

*End of scout report.*
