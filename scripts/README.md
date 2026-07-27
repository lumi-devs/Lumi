# Lumi Utility & Build Scripts (`scripts/`)

<div align="center">
  <img src="https://img.shields.io/badge/Directory-Scripts-blue?style=for-the-badge" alt="Directory">
  <img src="https://img.shields.io/badge/Runtime-Bun-black?style=for-the-badge" alt="Bun">
</div>

> Ecosystem utility scripts supporting static manifest generation, third-party addon validation, remote repository testing, event bus chaos testing, and QA environment setup.

---

## 📜 Script Reference Catalog

### 1. `generate-manifests.ts`
- **Usage**: `bun run modules:manifest`
- **Description**: Build-time utility that generates static `manifest.json` contracts for all modules in `packages/core/src/modules/`. It parses `@DefineModule` metadata, options, and Shapeshift schemas without invoking module runtime code, allowing `ModuleStore` to inspect constraints securely during client initialization.

### 2. `validate-addon.ts`
- **Usage**: `bun run validate <path-to-addon>`
- **Description**: CLI tool to perform structural validation on third-party addons. Asserts presence of `info.json`, validates `@DefineModule` export in `index.ts`, verifies that background tasks reside strictly in `scheduled-tasks/`, and flags forbidden patterns (such as cross-module imports).

### 3. `test-remote-addons.ts`
- **Usage**: `bun scripts/test-remote-addons.ts [repo-url]`
- **Description**: Integration test runner that clones remote addon repositories (defaulting to official `lumi-addons`), provisions a local monolith runtime, and sequentially installs, validates, and uninstalls exposed modules.

### 4. `verify-chaos.ts`
- **Usage**: `bun run verify:chaos`
- **Description**: Chaos verification suite testing event bus delivery resiliency, consumer group fanout, stream lag metrics, and reconnect scenarios across Redis Streams and NATS JetStream backends.

### 5. `qa-setup.ts`
- **Usage**: `bun scripts/qa-setup.ts`
- **Description**: Provisions a Discord guild testing environment by connecting via `BOT_TOKEN` and setting up designated QA test roles and channel permission overrides.

---

## 💻 Execution Examples

```bash
# Generate static module manifests
bun run modules:manifest

# Validate a local third-party addon
bun run validate ./path/to/addon

# Run event bus chaos tests
bun run verify:chaos
```
