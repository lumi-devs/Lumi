# Framework: Events

## Listeners

One file per event under `listeners/`, auto-attached on module load:

```ts
import { defineListener } from "#lib/listeners/ListenerDef.js";

export const onJoin = defineListener({
  event: "guildMemberAdd",
  module: "my-module",
  async execute(services, member) {},
});
```

## Event bus and utilities

`services.eventBus` carries typed streams (`publish`/`subscribe`) for
cross-module signals. For shared services, `defineUtility` +
`getUtility("name")` expose a typed singleton other modules consume
without imports (e.g. `getUtility("filter")`, `tryGetUtility("guild-log")`).
Utility types are extended through the `Utilities` interface.

## Scoped bus

`scopedEventBus(services, moduleName)` (`src/lib/commands/Hooks.ts`)
wraps `services.eventBus` with the same `publish`/`subscribe` shape.
`subscribe` records the consumer's stop function per module;
`detachScopedBus(moduleName)` stops them all and is idempotent:

```ts
const bus = scopedEventBus(services, "my-module");
await bus.subscribe(["lumi:thing"], { group: "g", consumer: "c" }, async (msg) => {
  await msg.ack();
});
await detachScopedBus("my-module");
```

Unload calls `detachScopedBus(name)` so reloading a module never stacks
duplicate consumers on the same streams. The unload wiring is owned by
the dispatch/unload pass.
