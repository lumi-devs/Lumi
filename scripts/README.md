# Lumi Utility & Ecosystem Scripts

This directory contains CLI tools, build-time code generators, integration testing suites, database seeders, and operational scripts supporting the Lumi monorepo and addon ecosystem.

> [!NOTE]
> All scripts in this directory are executed using [Bun](https://bun.sh) (`bun run` or `bun <script-path>`). Some testing and provisioning scripts require a configured `.env` file with backing datastores (PostgreSQL, Redis, RabbitMQ) running.

---

## Scripts Catalog

| Script | Invocation Alias | Primary Purpose | Environment Requirements |
| :--- | :--- | :--- | :--- |
| `setup.sh` | `bun run setup` | Interactive first-run wizard: generates `.env`, verifies the bot token, optionally starts `docker compose` | Offline CLI (curl/docker optional) |
| `generate-manifests.ts` | `bun run modules:manifest` | Build-time manifest generator for internal & external modules | Node/Bun file system |
| `validate-addon.ts` | `bun run validate <path>` | Structural and architectural validator for local third-party addons | Offline CLI |
| `create-addon.ts` | `bun run addon:create <name>` | Scaffolds a new addon/module directory from a minimal template | Offline CLI |
| `seed.ts` | `bun run db:seed` | Populates local PostgreSQL database with QA test guilds & config | PostgreSQL |
| `benchmark.ts` | `bun run bench` | Performance benchmark suite measuring PermitResolver, Card UI, & formatters | Offline CLI |
| `verify-resilience.ts` | `bun run verify:resilience` | Fault-tolerance & event-bus message durability test suite | Redis Streams |

---

## Script Reference

### `setup.sh`

**Command:** `bun run setup`

Interactive onboarding wizard for a fresh checkout. Bash, not Bun/TS, since it runs before any dependency is installed.

#### Overview & Mechanics

1. Prompts for every mandatory variable in `.env.example` (bot token, client ID, Postgres/Redis/RabbitMQ credentials), plus a few common general/dashboard settings, and writes the result to `.env` (mode `600`). Refuses to clobber an existing `.env` without confirmation.
2. Verifies the entered bot token with a live `GET https://discord.com/api/v10/users/@me` request (`Authorization: Bot <token>`) and prints the resolved bot username on success. A failed/unreachable check is a warning, not a hard stop - setup still completes so you can fix `.env` by hand.
3. Optionally runs `docker compose up -d postgres pgbouncer redis rabbitmq` if Docker is available.

#### Usage Examples

```bash
# Full interactive setup
bun run setup

# Same thing, direct invocation
bash scripts/setup.sh
```

### `generate-manifests.ts`

**Command:** `bun run modules:manifest [extra-directories...]`

Build-time utility that scans module directories, reads in-code `@DefineModule` metadata, and generates a static `manifest.json` contract in each module's directory.

#### Overview & Mechanics

The Lumi runtime (`ModuleStore`) requires module configuration schemas, default enable states, command metadata, and permission constraints during early bootstrap. To avoid importing and executing arbitrary TypeScript module code at startup, `generate-manifests.ts` generates static `manifest.json` files.

1. Scans default targets (`packages/core/src/modules`, `packages/core/src/lib/modules`) and any additional paths specified via command-line arguments.
2. Recursively searches for module entrypoints (`index.ts`, `index.js`, `index.mts`).
3. Dynamically imports each entrypoint to extract `meta` properties defined via Zod schemas and metadata decorators.
4. Serializes the metadata and writes a structured `manifest.json` file alongside each module's code.

#### Usage Examples

```bash
# Generate manifest.json for all core monorepo modules
bun run modules:manifest

# Generate manifests for core modules AND a local addon development directory
bun scripts/generate-manifests.ts ../my-custom-addon
```

---

### `validate-addon.ts`

**Command:** `bun run validate <path-to-addon-or-repo>`

A structural validation utility used during addon development and CI pipelines to assert that third-party addons follow Lumi's architectural rules before deployment.

#### Validation Checks

`validate-addon.ts` enforces the exact structural checks executed by `DownloaderService` at runtime:

* **Manifest Integrity**: Asserts presence and valid JSON formatting of `info.json`.
* **Module Definition**: Verifies that `index.ts` exports a valid `@DefineModule` decorator definition.
* **Directory Conventions**: Ensures all Sapphire Scheduled Tasks are placed strictly inside a `scheduled-tasks/` subdirectory.
* **Architectural Boundaries**: Checks for forbidden cross-module relative imports and disallowed global monkey-patching patterns.
* **Memory-leak heuristics** *(warnings, not errors)*: flags `setInterval`/`setTimeout` handles that are never stored or never passed to `clearInterval`/`clearTimeout`, `.on(`/`.addListener(` registrations with no `onUnload`/`dispose`/`.off(`/`.removeListener(` anywhere in the same file, and module-level `let`/array/`Map`/`Set` state that's pushed/set/added to without any visible bound or eviction. These are best-effort static checks (regex-level, not a real parser) meant to prompt a second look, not a verdict - see `packages/core/src/lib/downloader/validate.ts`.

#### Usage Examples

```bash
# Validate a single local addon directory
bun run validate ./data/3rd-party-modules/moderation-plus

# Validate a full repository containing multiple addon directories
bun run validate ./my-addons-repository
```

---

### `create-addon.ts`

**Command:** `bun run addon:create <name> [--dir <path>] [--display-name <text>] [--author <name>] [--force]`

Scaffolds a new addon directory with the minimal boilerplate a real addon needs - `info.json`, `index.ts` (`@DefineModule` + a `configSchema` field + a no-op `deleteUserData`), one command stub, and a `README.md` - mirroring `examples/addon-example-1-hello-world`, the addon [`docs/QUICK_START_ADDON.md`](../docs/QUICK_START_ADDON.md) walks through.

#### Overview & Mechanics

Writes into `./addons/<name>` by default (gitignored - a personal scratch directory, the same shape `LUMI_DEV_PATHS` expects: a directory containing one or more addon subfolders). Refuses to overwrite an existing directory unless `--force` is passed.

#### Usage Examples

```bash
# Scaffold ./addons/welcome-messages
bun run addon:create welcome-messages

# Custom output location and metadata
bun run addon:create tag-manager --dir ../lumi-addons --author "Your Name"

# Validate what got generated
bun run validate ./addons/welcome-messages
```

---

### `seed.ts`

**Command:** `bun run db:seed`

Development database seeding utility that populates local PostgreSQL databases with sample Global configuration, QA Test Guilds (`123456789012345678`), enabled module states, Wick-style custom permits, and sample moderation cases.

#### Provisioned Entities

- **Global Config**: Default prefix (`!`), maintenance mode flag.
- **QA Test Guild**: Guild ID `123456789012345678` with default role IDs.
- **Module States**: Enable state for all 8 core modules (`core`, `mod`, `filter`, `utility`, `afk`, `tempvc`, `logging`, `dashboard`).
- **Custom Permits**: Permissive `mod.*` wildcard node assigned to QA Moderator Role.
- **Moderation Cases**: Sample warning case history.

#### Usage Examples

```bash
# Seed development database
bun run db:seed
```

---

### `verify-resilience.ts`

**Command:** `bun run verify:resilience`

A fault-tolerance and distributed event-bus verification suite that tests message delivery semantics, consumer group isolation, high-concurrency burst loads, and connection failure recovery across **Redis Streams**.

#### Test Scenarios

| Backend | Scenario Name | Assertion / Target |
| :--- | :--- | :--- |
| **Redis Streams** | Basic publish & consume round-trip | Verified message delivery and payload integrity |
| **Redis Streams** | Sequential ordering under queue load | Strict FIFO sequence preservation across 10+ messages |
| **Redis Streams** | Consumer group isolation & fanout | Independent delivery across `GROUP_ALPHA` and `GROUP_BETA` |
| **Redis Streams** | High-throughput burst load | 100 parallel message dispatches with >=90% delivery assertion |
| **Redis Streams** | Lifecycle & graceful shutdown | Clean socket disconnects without unhandled rejections |
| **Redis Streams** | Bus re-initialization | Re-establishment of stream consumers after connection drop |

#### Usage Examples

```bash
# Run resilience verification suite against local Redis
bun run verify:resilience
```

---

## Guidelines for Script Authors

> [!TIP]
> When adding new utility scripts to `scripts/`:
> 1. Use `#!/usr/bin/env bun` at the top of executable TS scripts.
> 2. Ensure explicit process exit codes (`0` for success, non-zero for failures).
> 3. Add corresponding npm script aliases in `package.json` if the script is part of regular development workflows.
> 4. Document usage examples and parameters in this `README.md`.
