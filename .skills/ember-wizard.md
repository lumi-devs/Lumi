# Ember Module Wizard — scaffolding a new feature

Step-by-step for adding a feature module to Ember. See the `ember-*` skills in `~/.claude/skills/` for depth.

## 1. Create the module directory

```
src/modules/<name>/
  index.ts              # @EmberModule class (REQUIRED)
  commands/             # EmberCommand / EmberSubcommand pieces
  listeners/            # Sapphire Listener pieces
  interaction-handlers/ # buttons / selects / modals
  services/             # Service singletons
  scheduled-tasks/      # BullMQ ScheduledTask pieces  ← NEVER name this "tasks/"
  data.ts / keys.ts / lib/ / ui/   # plain helpers (not pieces)
```

## 2. `index.ts`

```typescript
import { Module, EmberModule, FieldType } from "#core/module-system/Module.js";

@EmberModule({
  name: "<name>",
  displayName: "<Display>",
  emoji: "✨",
  version: "1.0.0",
  description: "<one line>",
  configFields: [ /* optional */ ],
  // dependencies, conflicts, isCore as needed
})
export class <Name>Module extends Module {
  // optional: onLoad/onUnload, deleteUserData(userId, requester)
}
```

The `ModuleStore` auto-discovers this and loads the sub-stores. Don't manually `registerPath` the standard sub-stores.

## 3. Wiring checklist

- **Commands**: extend `EmberCommand`; set `permissionLevel`; call `.setDefaultMemberPermissions(this.defaultMemberPermissions ?? null).setContexts(...this.contexts).setIntegrationTypes(this.integrationTypes)` on every builder.
- **Replies**: card factories only (`#utilities/cards.js`) — no raw embeds.
- **Data**: `container.db` only — never `container.prisma` from a module. New Prisma tables → edit `prisma/schema.prisma` + `bun run db:generate`/`db:push`.
- **Redis**: add keys to `RedisKeys` (or module `keys.ts` with the `ember:` prefix); bust via `InvalidationBus`.
- **Config reload**: register `container.configChangeHooks.set("<name>:<key>", fn)` in `onLoad`, delete in `onUnload`.
- **Scheduled tasks**: piece in `scheduled-tasks/` + payload type in `EmberScheduledTasks` (`src/core/types/common.ts`) + `container.tasks.create` with a stable `jobId`. Re-arm on load if needed.
- **GDPR**: implement `deleteUserData` if the module stores per-user data.
- **Dashboard**: expose operations via `registerRpcHandler` in `onLoad` (Zod-validate payloads).

## 4. Verify

```bash
bun run typecheck
bun run lint
bun test
```

Then enable with `/module enable <name>` and test the golden path in a guild.
