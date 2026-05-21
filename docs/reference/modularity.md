# Modularity & Lifecycle

Ember is designed around a **Feature-First Modularity** architecture. Unlike traditional monolithic bots where commands, listeners, and services are grouped by type, Ember groups them by domain. Each feature lives in its own isolated directory under `src/modules/`, forming a self-contained unit that can be enabled, disabled, or reloaded independently.

## Discovery Mechanism

The module system employs a **filesystem-driven discovery** pattern. At startup, the `ModuleManager` performs a recursive walk of the `src/modules/` directory.

- **Flat Layout:** `src/modules/afk/index.ts`
- **Categorized Layout:** `src/modules/moderation/warn/index.ts`

A directory is recognized as a module if it contains an `index.ts` file that exports a `meta` object conforming to the `ModuleMeta` interface. If a directory contains no `index.ts` but has subdirectories, it is treated as a category, and the discovery engine descends one level deeper.

## Topological Sorting

To manage complex relationships between features, Ember utilizes **Topological Sorting** (via Kahn's algorithm or similar DFS walk) to determine the load order.

1.  **Dependency Resolution:** Modules can declare `dependencies`. The manager ensures that these are loaded and initialized before the dependent module.
2.  **Conflict Prevention:** Modules can declare `conflicts`. If two conflicting modules are discovered, the manager employs a "first-wins" resolution strategy, skipping the conflicting module and logging a warning.
3.  **Circular Detection:** The system detects circular dependency chains (e.g., A → B → A) during discovery and throws an error before initialization begins.

## The 'No Cross-Module Imports' Rule

To maintain strict modular isolation, Ember enforces a foundational mandate: **Modules must never import directly from other modules.**

- **Shared Logic:** If logic needs to be shared between two modules, it must be promoted to `src/lib/`.
- **Communication:** Inter-module communication should happen through the global `container`, via events (RabbitMQ), or by querying the database (Prisma).
- **Enforcement:** This rule ensures that a module can be safely deleted or disabled without causing side-effects or "dangling reference" errors in unrelated parts of the codebase.

## Lifecycle Hooks

Each module can hook into the system's lifecycle via its `meta` export:

- **`onLoad`**: Called after the module's pieces (commands, listeners) are registered with Sapphire but before the bot logs into Discord. Use this to initialize module-specific services.
- **`onUnload`**: Called during a manual reload or system shutdown. Modules are responsible for freeing resources (closing connections, clearing intervals) to prevent memory leaks.
- **`deleteUserData`**: A GDPR-compliance hook. When a user requests data deletion, this hook is fanned out to all modules to purge domain-specific user records.
