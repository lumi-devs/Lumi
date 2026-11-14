# Lumi Utility & Ecosystem Scripts

This directory contains CLI tools, build-time code generators, integration testing suites, database seeders, and operational scripts supporting the Lumi monorepo and addon ecosystem.

> [!NOTE]
> All scripts in this directory are executed using [Bun](https://bun.sh) (`bun run` or `bun <script-path>`). Some testing and provisioning scripts require a configured `.env` file with backing datastores (PostgreSQL, Redis) running.

---

## Scripts Catalog

| Script | Invocation Alias | Primary Purpose | Environment Requirements |
| :--- | :--- | :--- | :--- |
| `setup.sh` | `bash scripts/setup.sh` | Interactive first-run wizard: generates `.env`, verifies the bot token, optionally starts `docker compose` | Offline CLI (curl/docker optional) |
| `src/scripts/GenerateManifests.ts` | `bun run modules:manifest` | Build-time manifest generator for internal & external modules | Node/Bun file system |
| `src/scripts/ValidateAddon.ts` | `bun run validate <path>` | Structural and architectural validator for local third-party addons | Offline CLI |
| `CreateAddon.ts` | `bun scripts/CreateAddon.ts <name>` | Scaffolds a new addon/module directory from a minimal template | Offline CLI |
| `src/scripts/Benchmark.ts` | `bun src/scripts/Benchmark.ts` | Performance benchmark suite measuring PermitResolver, Card UI, & formatters | Offline CLI |
| `src/scripts/VerifyResilience.ts` | `bun src/scripts/VerifyResilience.ts` | Fault-tolerance & event-bus message durability test suite | Redis Streams |

---

## Script Reference

### `setup.sh`

**Command:** `bash scripts/setup.sh`

Interactive onboarding wizard for a fresh checkout. Bash, not Bun/TS, since it runs before any dependency is installed.

#### Overview & Mechanics

1. Prompts for every mandatory variable in `.env.example` (bot token, client ID, Postgres/Redis credentials), plus a few common general/dashboard settings, and writes the result to `.env` (mode `600`). Refuses to clobber an existing `.env` without confirmation.
2. Verifies the entered bot token with a live `GET https://discord.com/api/v10/users/@me` request (`Authorization: Bot <token>`) and prints the resolved bot username on success. A failed/unreachable check is a warning, not a hard stop - setup still completes so you can fix `.env` by hand.
3. Optionally runs `docker compose up -d postgres pgbouncer redis` if Docker is available.

#### Usage Examples

```bash
# Full interactive setup
bash scripts/setup.sh
```

### `src/scripts/GenerateManifests.ts`

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
bun src/scripts/GenerateManifests.ts ../my-custom-addon
```

---

### `src/scripts/ValidateAddon.ts`

**Command:** `bun run validate <path-to-addon-or-repo>`

A structural validation utility used during addon development and CI pipelines to assert that third-party addons follow Lumi's architectural rules before deployment.

#### Validation Checks

`validate-addon.ts` enforces the exact structural checks executed by `DownloaderService` at runtime:

* **Manifest Integrity**: Asserts presence and valid JSON formatting of `info.json`.
* **Module Definition**: Verifies that `index.ts` exports a valid `@DefineModule` decorator definition.
* **Directory Conventions**: Ensures all scheduled tasks are placed strictly inside a `scheduled-tasks/` subdirectory.
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

### `CreateAddon.ts`

**Command:** `bun scripts/CreateAddon.ts <name> [--dir <path>] [--display-name <text>] [--author <name>] [--force]`

Scaffolds a new addon directory with the minimal boilerplate a real addon needs - `info.json`, `index.ts` (`@DefineModule` + a `configSchema` field + a no-op `deleteUserData`), one command stub, and a `README.md` - mirroring `hello-world` in [`lumi-devs/lumi-addons`](https://github.com/lumi-devs/lumi-addons)'s `examples/`, as documented in the [Addon Overview](https://lumi-devs.github.io/Lumi-docs/addons/overview).

#### Overview & Mechanics

Writes into `./addons/<name>` by default (gitignored - a personal scratch directory, the same shape `LUMI_DEV_PATHS` expects: a directory containing one or more addon subfolders). Refuses to overwrite an existing directory unless `--force` is passed.

#### Usage Examples

```bash
# Scaffold ./addons/welcome-messages
bun scripts/CreateAddon.ts welcome-messages

# Custom output location and metadata
bun scripts/CreateAddon.ts tag-manager --dir ../lumi-addons --author "Your Name"

# Validate what got generated
bun run validate ./addons/welcome-messages
```

---

### `src/scripts/VerifyResilience.ts`

**Command:** `bun src/scripts/VerifyResilience.ts`

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
bun src/scripts/VerifyResilience.ts
```

---

## Guidelines for Script Authors

> [!TIP]
> When adding new utility scripts to `scripts/`:
> 1. Use `#!/usr/bin/env bun` at the top of executable TS scripts.
> 2. Ensure explicit process exit codes (`0` for success, non-zero for failures).
> 3. Add corresponding npm script aliases in `package.json` if the script is part of regular development workflows.
> 4. Document usage examples and parameters in this `README.md`.
