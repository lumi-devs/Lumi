# Lumi-TS Build & Ecosystem Scripts

This directory contains utility scripts that support the Lumi-TS ecosystem. These scripts are typically invoked via `bun run` or through `package.json` aliases and are essential for addon management and structural validation.

---

## `generate-manifests.ts`

**Usage:** `bun run modules:manifest`

A build-time utility that generates a static `manifest.json` for every module in the codebase. It parses each module's `index.ts` to extract its `@DefineModule` metadata, including configuration schemas, default enabled status, and permissions. This static contract allows the runtime module discovery system (`ModuleStore`) to read configuration constraints without executing module code, ensuring a secure and efficient initialization phase.

## `validate-addon.ts`

**Usage:** `bun run validate <path>`

A command-line tool to perform structural validation on local third-party addons. It runs the same strict checks that the Downloader service applies at runtime:
- Verifies the presence and validity of `info.json`
- Ensures a valid `@DefineModule` export in `index.ts`
- Asserts that all Scheduled Tasks are placed in the strictly required `scheduled-tasks/` directory
- Validates that the addon does not perform cross-module imports or other banned architectural patterns

Use this script during local development to ensure an addon is structurally sound before attempting to load it in production.

## `test-remote-addons.ts`

**Usage:** `bun scripts/test-remote-addons.ts [repo-url]`

An integration testing script that validates remote addon repositories. It provisions a local monolith runtime, downloads a target addon repository (defaulting to the public `lumi-addons` repo), and sequentially installs every module exposed by it.
The script verifies that each addon successfully registers with the `ModuleStore` without runtime faults or missing dependencies, and then cleanly uninstalls them.

**Note:** Requires a local `.env` with a valid `BOT_TOKEN` and the backing datastores (PostgreSQL, Redis, RabbitMQ) to be running.
