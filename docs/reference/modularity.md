# Modularity & Lifecycle

Ember is designed around a **Feature-First Modularity** architecture. Instead of traditional monolithic bots where commands, listeners, and services are grouped by type, Ember groups optional feature modules under `src/modules/` and non-removable, built-in services under `src/core/`.

## Discovery & Loading (ModuleStore)

Ember implements a custom Sapphire `Store` called **`ModuleStore`** (defined in `src/core/module-system/ModuleStore.ts`). 

- **Custom Pieces:** Features are represented by classes extending the custom `Module` base class (`src/core/module-system/Module.ts`).
- **Core vs Feature Modules:** 
  - **Core Module:** Located at `src/core/index.ts`, this is a built-in module piece initialized with `isCore = true`. It is protected by the `ModuleStore` and cannot be disabled.
  - **Feature Modules:** Located in directories under `src/modules/` (e.g. `src/modules/afk/`, `src/modules/raids/`), these extend the same `Module` base class and are registered dynamically. They can be toggled on or off per-guild or globally via the database/RPC.

## The 'No Cross-Module Imports' Rule

To maintain strict modular isolation, Ember enforces a foundational mandate: **Feature modules must never import directly from other modules.**

- **Shared Logic:** If logic needs to be shared, it must be promoted to `src/utilities/` (for pure helpers, formatting, branding, cards) or `src/database/` (for models, Prisma schemas, and cache CRUD wrappers).
- **Communication:** Inter-module communication should happen through the global `container`, via events (RabbitMQ), or by querying database configurations.
- **Enforcement:** This rule ensures that a module can be safely deleted or disabled without causing side-effects or "dangling reference" compiler errors.

## Lifecycle Hooks

Each module conforms to the custom `Module` piece lifecycle:

- **`onLoad()`**: Called after the module's pieces (commands, listeners) are registered with Sapphire but before the bot logs into Discord. Use this to initialize module-specific services.
- **`onUnload()`**: Called during a manual reload or system shutdown. Modules are responsible for freeing resources (closing connections, clearing intervals) to prevent memory leaks.
- **`deleteUserData()`**: A GDPR-compliance hook. When a user requests data deletion, this hook is fanned out to all modules to purge domain-specific user records.
