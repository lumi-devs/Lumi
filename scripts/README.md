# Lumi Utility & Ecosystem Scripts

This directory contains CLI tools, build-time code generators, integration testing suites, and operational scripts supporting the Lumi monorepo and addon ecosystem.

> [!NOTE]
> All scripts in this directory are executed using [Bun](https://bun.sh) (`bun run` or `bun <script-path>`). Some testing and provisioning scripts require a configured `.env` file with backing datastores (PostgreSQL, Redis, RabbitMQ) running.

---

## Scripts Catalog

| Script | Invocation Alias | Primary Purpose | Environment Requirements |
| :--- | :--- | :--- | :--- |
| `generate-manifests.ts` | `bun run modules:manifest` | Build-time manifest generator for internal & external modules | Node/Bun file system |
| `validate-addon.ts` | `bun run validate <path>` | Structural and architectural validator for local third-party addons | Offline CLI |
| `test-remote-addons.ts` | `bun scripts/test-remote-addons.ts` | Integration tester for remote/git addon repositories | `.env`, DB, Redis, RabbitMQ |
| `qa-setup.ts` | `bun scripts/qa-setup.ts` | Discord server QA environment automated setup script | `BOT_TOKEN`, Discord Guild |
| `verify-resilience.ts` | `bun run verify:resilience` | Fault-tolerance & event-bus message durability test suite | Redis Streams |

---

## Script Reference

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

#### Usage Examples

```bash
# Validate a single local addon directory
bun run validate ./data/3rd-party-modules/moderation-plus

# Validate a full repository containing multiple addon directories
bun run validate ./my-addons-repository
```

---

### `test-remote-addons.ts`

**Command:** `bun scripts/test-remote-addons.ts [repo-url]`

An integration testing harness that boots a full Lumi worker client, connects to a remote Git addon repository, and verifies that every module in the repository can be installed, loaded into Sapphire stores, and cleanly uninstalled without runtime errors.

> [!IMPORTANT]
> Running this script requires an active PostgreSQL, Redis, and RabbitMQ instance, along with a valid `BOT_TOKEN` in `.env`.

#### Workflow

1. Initializes `LumiClient` in standalone worker mode and logs into Discord Gateway.
2. Clones or fetches the target Git repository (defaults to `https://github.com/lumi-devs/lumi-addons.git`).
3. Enumerates all modules exposed by the repository.
4. For each module:
   - Installs the module into the local runtime.
   - Asserts that the module registers valid `ModuleStore` records and attaches pieces to Sapphire stores.
   - Uninstalls the module and asserts complete cleanup without leftover store pieces.
5. Exit code `0` indicates all modules passed install/load/uninstall verification. Exit code `1` indicates failures.

#### Usage Examples

```bash
# Run integration verification against the official public addon repository
bun scripts/test-remote-addons.ts

# Test a custom remote Git addon repository
bun scripts/test-remote-addons.ts https://github.com/my-org/custom-lumi-addons.git

# Test a local working copy using file:// URL
bun scripts/test-remote-addons.ts file:///home/user/code/lumi-addons
```

---

### `qa-setup.ts`

**Command:** `bun scripts/qa-setup.ts`

An automated setup script designed for QA and local testing environments. Connects to Discord using the configured `BOT_TOKEN` and provisions roles, channels, and categories in the first available Discord server.

#### Provisioned Artifacts

| Category | Item Name | Details / Specifications |
| :--- | :--- | :--- |
| **Roles** | `Lumi Tester` | Color `#00FF00` (Green), assigned for testing permission tiers |
| **Roles** | `Muted` | Color `#808080` (Gray), assigned for moderation testing |
| **Categories** | `Lumi QA` | Parent category for text channels |
| **Categories** | `QA TempVC` | Parent category for dynamic voice channel testing |
| **Channels** | `#lumi-qa-general` | Text channel; posts an initial readiness greeting |
| **Channels** | `#lumi-qa-logs` | Text channel for testing moderation log outputs |

#### Usage Examples

```bash
# Provision QA roles and channels in your test server
bun scripts/qa-setup.ts
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
# Run resilience verification suite against local Redis (default localhost:6379)
bun run verify:resilience
# Run resilience suite with custom Redis host

REDIS_HOST=127.0.0.1 REDIS_PORT=6379 bun run verify:resilience
```

---

## Guidelines for Script Authors

> [!TIP]
> When adding new utility scripts to `scripts/`:
> 1. Use `#!/usr/bin/env bun` at the top of executable TS scripts.
> 2. Ensure explicit process exit codes (`0` for success, non-zero for failures).
> 3. Add corresponding npm script aliases in `package.json` if the script is part of regular development workflows.
> 4. Document usage examples and parameters in this `README.md`.
