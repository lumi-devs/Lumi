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
