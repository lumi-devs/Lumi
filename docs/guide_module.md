# Creating Modules

This guide covers writing a module: the directory shape, the entrypoint,
commands, and the per-guild framework API. Publishing is in
`guide_publish.md`.

## Shape

One directory, everything colocated. Core modules live under
`src/modules/<name>/`, third-party addons under `data/addons/<name>/`.
Same loader, same shape.

```
my-module/
  Index.ts         # defineModule({ name, ... }) entrypoint
  commands/        # one file per command, exporting a CommandDef
  listeners/       # one file per event, exporting listener defs
  interactions/    # buttons / selects / modals, prefix-routed handlers
  tasks/           # scheduled-task classes, run in-process by BullMQ
  services/        # module-owned logic
  data/            # repositories (Prisma) and caches
  manifest.json    # generated discovery fast path (do not hand-write)
```

Never import from a sibling module. Shared code belongs in `src/lib/*`.
Cross-module access (the only sanctioned kind) goes through the runtime:

```ts
const mod = services.moduleStore.get("economy");
const filter = getUtility("filter");
```

## Entrypoint

```ts
import { defineModule } from "#lib/module-system/Module.js";

export default defineModule({
  name: "my-module",
  displayName: "My Module",
  emoji: "🧩",
  description: "What it does.",
  version: "1.0.0",
  dependencies: [],
  async onLoad(services) {},
  async onUnload(services) {},
  deleteUserData: async (services, userId) => {},
  exportUserData: async (services, userId) => {},
});
```

Scaffold one with `lumi addon create <name>`, check it with
`lumi addon validate <dir>`.

## Commands

```ts
import type { CommandDef } from "#lib/commands/CommandDef.js";

export const myDef: CommandDef = {
  name: "mycmd",
  description: "What it does.",
  guildOnly: true,
  requiredPermit: "mymodule.use",
  cooldownMs: 5_000,
  cooldownBucket: { limit: 3, windowMs: 60_000, scope: "user" },
  build: () => new SlashCommandBuilder().setName("mycmd").setDescription("..."),
  run: async (ctx) => {
    const name = await ctx.getString("name", { required: true });
    await ctx.replySuccess("Done", `Hello ${name}.`);
  },
};
```

Every command is slash + prefix natively. Cooldown scopes are `user`
(default), `guild`, `channel`, or `member`. See `framework_commands.md`.

## ModuleApi

`createModuleApi(services, moduleName, Defaults, guildId)` binds everything
a module needs for one guild. Command handlers build one per invocation:

```ts
const api = createModuleApi(services, "my-module", Defaults, guildId);
await api.bank.deposit(userId, 100);          // framework_bank.md
await api.levels.addXp(userId, 100);          // framework_leveling.md
await api.config.get("currency_name");        // framework_config.md
await api.kv.set(userId, "nickname", "Bob");  // framework_data.md
await api.later("recheck", 60_000, { channelId }); // framework_tasks.md
await ctx.replySuccess("Done", `Hello ${name}.`);
```

Each `api.*` surface is documented in its `framework_*.md` file; the
guide stays an index so examples never drift in two places.

One-shot timers fire the module's `oneshots` map from `Index.ts`:

```ts
export const oneshots = {
  recheck: async (services, { guildId, data }) => {},
};
```

## Listeners and tasks

```ts
import { defineListener } from "#lib/listeners/ListenerDef.js";

export const onJoin = defineListener({
  event: "guildMemberAdd",
  module: "my-module",
  async execute(services, member) {},
});
```

```ts
import { LumiScheduledTask } from "#lib/scheduler/Tasks.js";

export class SweepTask extends LumiScheduledTask {
  public constructor() {
    super({ name: "my-module-sweep", pattern: "*/5 * * * *" });
  }
  public async run(services: Container) {}
}
```

`tasks/` classes are discovered from the module directory and run
in-process. No separate scheduler to deploy. See `framework_tasks.md`.

## GDPR hooks

`deleteUserData` removes a user's rows, `exportUserData` returns them.
Both run during GDPR erasure/export flows - implement them whenever the
module stores user IDs.
