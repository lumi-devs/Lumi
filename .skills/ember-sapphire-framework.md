# Ember × Sapphire v5 — framework quick reference

Ember runs **Sapphire v5** (`@sapphire/framework ^5.5.0`) on **Bun**, with plugins: `plugin-subcommands`, `plugin-scheduled-tasks`, `plugin-i18next`, `plugin-api`. The client is `EmberClient` (`src/client/EmberClient.ts`).

## Container (augmented)

`import { container } from "@sapphire/framework"` exposes, beyond stock Sapphire:
`prisma`, `redis`, `invalidation` (InvalidationBus), `db` (DatabaseService — use this, not prisma), `moduleStore`, `modules`, `workers` (WorkerManager), `rabbit?` (RabbitClient), `configChangeHooks` (Map), `tasks` (scheduled tasks), `stats`.

## Stores

Stock: `commands`, `listeners`, `interaction-handlers`, `preconditions`, `scheduled-tasks`, `routes`. Ember adds: `services` (ServiceStore) and `modules` (ModuleStore). Base paths registered in the `EmberClient` constructor: `src/core/`, `src/core/permissions/`, `src/core/sentry/`, and `src/modules/` (via ModuleStore root).

## Piece base classes (always use the Ember subclasses)

| Concern | Use | Not |
|---|---|---|
| Slash/message command | `EmberCommand` (`#lib/commands.js`) | bare `Command` |
| Subcommand groups | `EmberSubcommand` | bare `Subcommand` |
| Singleton logic | `Service` (`#core/module-system/Service.js`) | ad-hoc classes |
| Buttons/selects/modals | `EmberInteractionHandler` (`#core/lib/interaction-handler.js`) | bare `InteractionHandler` |
| Feature module | `Module` + `@EmberModule` | — |

## Application commands

`ApplicationCommandRegistries` default behavior is `BulkOverwrite`. Every builder must set `defaultMemberPermissions`, `contexts`, and `integrationTypes` (the Ember base classes compute sensible values from `permissionLevel`/`GuildOnly`).

## Startup order (`EmberClient.login`)

1. Prisma connect + InvalidationBus start.
2. RabbitMQ connect (15s timeout, best-effort).
3. `moduleStore.discover()`.
4. `super.login()` (Sapphire loads all stores/pieces).
5. Start Rabbit consumers if connected; begin 60s DB liveness ping.

## Gotchas

- **`scheduled-tasks/` dir naming** — see the dedicated `ember-background-jobs` skill. Wrong name = silently never loaded.
- **STRING config fields are stored verbatim** — split comma-lists yourself.
- **Never `redis.del` shared cache keys** — go through `InvalidationBus`.
- When unsure about Sapphire APIs, fetch docs (sitemap at `~/.claude/skills/sapphire.js-sitemap.xml`) rather than guessing.
